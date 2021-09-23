import { DocumentClient } from 'aws-sdk/clients/dynamodb';
import AWS from 'aws-sdk';
import moment from 'moment';
import { getSecretString } from '@lsp/common';
import { Scraper } from './scraper';

const s3 = new AWS.S3();

export interface IReport {
    url: string;
    href: string;
    date: Date;
    first_name: string;
    last_name: string;
    imageHrefs: string[];
    questions: Array<{ label: string; answer: string }>;
}

const documentClient = new DocumentClient();

interface IReportWithHandlerData extends IReport {
    [key: string]: any;
}

interface IFindNewReportsResult {
    reportsScraped: number;
}

interface IFindNewReportsOptions {
    username: string;
    password: string;
    tableName: string;
    bucketName: string;
    domain: string;
}

async function findNewReports(input: IFindNewReportsOptions): Promise<IFindNewReportsResult> {
    const { username, password, tableName, bucketName, domain } = input;
    const scraper = new Scraper(username, password, domain);
    await scraper.start();
    const reports = await scraper.scrapeReportsList();
    let reportsScraped = 0;
    for (const reportHref of reports) {
        const skipProcessing = await shouldSkipProcessing(tableName, reportHref);
        if (skipProcessing) continue;
        reportsScraped++;
        const reportJson: IReportWithHandlerData = await scraper.scrapeReport(reportHref);
        console.info(`A report has been scraped found for ${reportJson.first_name}`);

        // upload photos to S3
        for (const imageHref of reportJson.imageHrefs) {
            if (!imageHref) continue;
            const fileName = imageHref ? /\/([0-9a-z]*\.jpeg)/i.exec(imageHref)?.[1] : undefined;
            if (!fileName) {
                console.warn(`imageHref found ${imageHref} that didn't have a filename match`);
                continue;
            }

            const baseParams = {
                Bucket: bucketName,
                Key: fileName,
            };

            const itemExists = await s3ItemExists(baseParams);
            if (!itemExists) {
                const fileBuffer = await scraper.downloadImage(imageHref);
                const params = {
                    ...baseParams,
                    Body: fileBuffer,
                };

                try {
                    const uploadResult = await new AWS.S3.ManagedUpload({ params }).promise();
                    console.info(`${fileName} uploaded to s3`, JSON.stringify(uploadResult, null, 0));
                } catch (err) {
                    console.error(err);
                    return err;
                }
            } else {
                console.info(`${fileName} was found in S3, skipping upload`);
            }
        }

        // upsert report DynamoDB
        try {
            const pk = formatReportKey(reportJson.first_name.toLowerCase().trim());
            const sk = moment(reportJson.date).format('YYYYMMDD');
            await documentClient
                .put({
                    TableName: tableName,
                    Item: {
                        ...reportJson,
                        pk,
                        sk,
                        created: moment().format('YYYYMMDD-hhmmss'),
                        date: sk,
                    },
                })
                .promise();

            await setProcessedByHref(tableName, reportHref, pk, sk);
        } catch (err) {
            console.error(err);
            throw err;
        }
    }

    await scraper.stop();
    return { reportsScraped };
}

export const findNewReportsHandler = async () => {
    const username = await getSecretString('LS_USERNAME');
    const password = await getSecretString('LS_PASSWORD');
    const domain = await getSecretString('LS_DOMAIN');

    const result = await findNewReports({
        username,
        password,
        domain,
        bucketName: process.env.PHOTOS_BUCKET,
        tableName: process.env.REPORTS_TABLE,
    });

    console.info(JSON.stringify(result));
};

function formatReportKey(date: string): string {
    return `Report:${date}`;
}

function formatProcessedKey(href: string): string {
    return `Processed:${href}`;
}
async function shouldSkipProcessing(tableName: string, href: string): Promise<boolean> {
    const recentReports = await documentClient
        .query({
            TableName: tableName,
            KeyConditionExpression: 'pk = :pk',
            ExpressionAttributeValues: { ':pk': formatProcessedKey(href) },
        })
        .promise();
    if (recentReports.Count === 0) return false;
    const item = recentReports.Items[0];
    const todayDate = moment().format('YYYYMMDD');
    return item.report_sk && item.report_sk !== todayDate;
}

async function setProcessedByHref(
    tableName: string,
    href: string,
    report_pk: string,
    report_sk: string,
): Promise<void> {
    try {
        await documentClient
            .put({
                TableName: tableName,
                Item: {
                    pk: formatProcessedKey(href),
                    sk: moment().format('YYYYMMDD-hhmmss'),
                    report_pk,
                    report_sk,
                },
            })
            .promise();
    } catch (err) {
        console.error(err);
        throw err;
    }
}

async function s3ItemExists(params: { Bucket: string; Key: string }): Promise<boolean> {
    try {
        await s3.headObject(params).promise();
        return true;
    } catch (headErr) {
        console.error(headErr);
        return false;
    }
}
