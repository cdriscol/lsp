// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config();
import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as sqs from '@aws-cdk/aws-sqs';
import * as sns from '@aws-cdk/aws-sns';
import * as actions from '@aws-cdk/aws-cloudwatch-actions';
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';
import { DynamoEventSource, SqsDlq } from '@aws-cdk/aws-lambda-event-sources';
import { Construct } from '@aws-cdk/core';

const getSecretByName = (scope: Construct, name: string): secretsmanager.ISecret =>
    secretsmanager.Secret.fromSecretNameV2(scope, name, name);

export class SMSStack extends cdk.Stack {
    constructor(
        scope: cdk.Construct,
        id: string,
        dynamoTable: dynamodb.Table,
        errorsTopic: sns.Topic,
        props?: cdk.StackProps,
    ) {
        super(scope, id, props);

        // Send SMS for items needed
        const twilioAccountSidSecret = getSecretByName(this, 'TWILIO_ACCOUNT_SID');
        const twilioAuthTokenSecret = getSecretByName(this, 'TWILIO_AUTH_TOKEN');
        const smsNumbersSecret = getSecretByName(this, 'SMS_NUMBERS');
        const twilioFromNumberSecret = getSecretByName(this, 'TWILIO_FROM_NUMBER');
        const smsNotificationsDeadLetterQueue = new sqs.Queue(this, 'sms-notifications-dlq');
        const sendNotificationsFn = new lambda.Function(this, 'sendNotifications', {
            runtime: lambda.Runtime.NODEJS_14_X,
            code: lambda.Code.fromAsset(path.join(require.resolve('@lsp/smsnotification'), '../..')),
            handler: 'dist/sms-notification-handler.smsNotificationHandler',
            memorySize: 180,
            timeout: cdk.Duration.seconds(10),
            description: 'Sends SMS notifications for important things',
        });
        twilioAccountSidSecret.grantRead(sendNotificationsFn);
        twilioAuthTokenSecret.grantRead(sendNotificationsFn);
        smsNumbersSecret.grantRead(sendNotificationsFn);
        twilioFromNumberSecret.grantRead(sendNotificationsFn);

        sendNotificationsFn.addEventSource(
            new DynamoEventSource(dynamoTable, {
                startingPosition: lambda.StartingPosition.TRIM_HORIZON,
                batchSize: 1,
                bisectBatchOnError: true,
                onFailure: new SqsDlq(smsNotificationsDeadLetterQueue),
                retryAttempts: 10,
            }),
        );

        sendNotificationsFn
            .metricErrors({
                period: cdk.Duration.minutes(1),
            })
            .createAlarm(this, 'lambda-error', {
                threshold: 1,
                evaluationPeriods: 1,
                alarmDescription:
                    'Alarm if the SUM of Errors is greater than or equal to the threshold (1) for 1 evaluation period',
            })
            .addAlarmAction(new actions.SnsAction(errorsTopic as any) as any);
    }
}
