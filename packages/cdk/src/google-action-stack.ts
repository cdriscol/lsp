// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config();
import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as sns from '@aws-cdk/aws-sns';
import * as actions from '@aws-cdk/aws-cloudwatch-actions';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as apigateway from '@aws-cdk/aws-apigateway';

export class GoogleActionStack extends cdk.Stack {
    constructor(
        scope: cdk.Construct,
        id: string,
        dynamoTable: dynamodb.Table,
        errorsTopic: sns.Topic,
        props?: cdk.StackProps,
    ) {
        super(scope, id, props);

        // Google Action webhook
        const googleActionFn = new lambda.Function(this, 'googleAction', {
            runtime: lambda.Runtime.NODEJS_14_X,
            code: lambda.Code.fromAsset(path.join(require.resolve('@lsp/googleaction'), '../..')),
            handler: 'dist/google-action-handler.googleActionHandler',
            memorySize: 128,
            description: 'Responds to Google Actions requests',
            environment: {
                TABLE_NAME: dynamoTable.tableName,
            },
        });
        const googleActionApi = new apigateway.LambdaRestApi(this, 'google-action-api', {
            handler: googleActionFn,
            proxy: false,
        });
        googleActionApi.root.addResource('google-action').addMethod('POST');
        dynamoTable.grantReadData(googleActionFn);

        googleActionFn
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
