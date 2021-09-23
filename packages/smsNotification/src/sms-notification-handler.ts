import twilio from 'twilio';
import AWS from 'aws-sdk';
import listify from 'listify';
import { getSecretString } from '@lsp/common';

export const smsNotificationHandler = async (event: any) => {
    for (const record of event.Records) {
        const isInsert = record?.eventName === 'INSERT';
        if (!isInsert) continue;
        const data = AWS.DynamoDB.Converter.unmarshall(record?.dynamodb?.NewImage);
        const isReport = data?.pk?.startsWith('Report:');
        if (!isReport) continue;

        const body = getMessageFromReport(data);
        if (!body) return;

        const accountSid = await getSecretString('TWILIO_ACCOUNT_SID');
        const authToken = await getSecretString('TWILIO_AUTH_TOKEN');
        const from = await getSecretString('TWILIO_FROM_NUMBER');
        const numbers = (await getSecretString('SMS_NUMBERS')).split(',').map((n) => n.trim());

        await sendSms({
            accountSid,
            authToken,
            from,
            numbers,
            body,
        });
    }
};

function getMessageFromReport(report: any): string {
    const itemsToBringQuestion = report?.questions?.find((question) => question?.label === 'Items to bring to school');
    if (!itemsToBringQuestion) return '';
    const formattedItems = listify(itemsToBringQuestion.answer.split(' ').map((a) => a.toLowerCase().trim()));
    return `${report.first_name} needs ${formattedItems} at daycare!`;
}

interface SMSResult {
    to: string;
    sid: string;
    status: string;
}

interface SMSInput {
    body: string;
    accountSid: string;
    authToken: string;
    from: string;
    numbers: string[];
}

async function sendSms(input: SMSInput): Promise<SMSResult[]> {
    const { accountSid, authToken, body, from, numbers } = input;
    const client = twilio(accountSid, authToken);

    const result: SMSResult[] = [];
    for (const number of numbers) {
        const smsResult = await client.messages.create({ to: `+${number}`, body, from });
        result.push(smsResult.toJSON());
    }

    return result;
}
