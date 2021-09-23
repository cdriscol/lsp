// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config();
import * as cdk from '@aws-cdk/core';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as s3 from '@aws-cdk/aws-s3';
import * as sns from '@aws-cdk/aws-sns';
import * as subscriptions from '@aws-cdk/aws-sns-subscriptions';
import { GooglePhotosUploadStack } from './google-photos-upload-stack';
import { SMSStack } from './sms-stack';
import { GoogleActionStack } from './google-action-stack';
import { ReportFinderStack } from './report-finder-stack';

const ERROR_EMAIL = process.env.LSP_ERROR_EMAIL;

export class LSPStack extends cdk.Stack {
    constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // CloudWatch errors topic
        const errorsTopic = new sns.Topic(this, 'lsp-errors-topic');
        if (ERROR_EMAIL) {
            errorsTopic.addSubscription(new subscriptions.EmailSubscription(ERROR_EMAIL));
        }

        // Store photos in S3
        const photosTopic = new sns.Topic(this, 'lsp-photos-topic');
        const photosBucket = this.createPhotosBucket();

        // Store reports in Dynamo (pk: Report:first_name, sk: YYYYMMDD)
        const dynamoTable = this.createDynamoTable();

        // Find new reports
        new ReportFinderStack(this, 'ReportFinderStack', dynamoTable, photosBucket, photosTopic, errorsTopic);

        this.createOptionalStacks(scope, dynamoTable, photosBucket, photosTopic, errorsTopic);
    }

    private createOptionalStacks(
        scope: cdk.App,
        dynamoTable: dynamodb.Table,
        photosBucket: s3.Bucket,
        photosTopic: sns.Topic,
        errorsTopic: sns.Topic,
    ): void {
        // Google photos upload
        new GooglePhotosUploadStack(scope, 'GooglePhotosUploadStack', photosTopic, photosBucket, errorsTopic, {
            description: 'Uploads photos from S3 to Google Photos Album',
        }).addDependency(this);

        // Twilio SMS notifications
        new SMSStack(scope, 'SMSStack', dynamoTable, errorsTopic, {
            description: 'Send SMS notifications for important items in the report',
        }).addDependency(this);

        // Google Action webhook
        new GoogleActionStack(scope, 'GoogleActionStack', dynamoTable, errorsTopic, {
            description: 'Webhook forGoogle Action requests',
        }).addDependency(this);
    }

    private createDynamoTable(): dynamodb.Table {
        return new dynamodb.Table(this, 'lsp-table', {
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            stream: dynamodb.StreamViewType.NEW_IMAGE,
            partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
        });
    }

    private createPhotosBucket(): s3.Bucket {
        return new s3.Bucket(this, 'lsp-photos-bucket', {
            lifecycleRules: [
                {
                    transitions: [
                        {
                            storageClass: s3.StorageClass.GLACIER,
                            transitionAfter: cdk.Duration.days(30),
                        },
                    ],
                },
            ],
        });
    }
}
