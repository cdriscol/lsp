// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config();
import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as targets from '@aws-cdk/aws-events-targets';
import * as events from '@aws-cdk/aws-events';
import * as s3 from '@aws-cdk/aws-s3';
import * as sns from '@aws-cdk/aws-sns';
import * as s3n from '@aws-cdk/aws-s3-notifications';
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';
import * as actions from '@aws-cdk/aws-cloudwatch-actions';
import { Construct } from '@aws-cdk/core';

const getSecretByName = (scope: Construct, name: string): secretsmanager.ISecret =>
    secretsmanager.Secret.fromSecretNameV2(scope, name, name);

export class ReportFinderStack extends cdk.NestedStack {
    constructor(
        scope: cdk.Construct,
        id: string,
        dynamoTable: dynamodb.Table,
        photosBucket: s3.Bucket,
        photosTopic: sns.Topic,
        errorsTopic: sns.Topic,
        props?: cdk.NestedStackProps,
    ) {
        super(scope, id, props);

        // Find new reports
        const usernameSecret = getSecretByName(this, 'LS_USERNAME');
        const passwordSecret = getSecretByName(this, 'LS_PASSWORD');
        const domainSecret = getSecretByName(this, 'LS_DOMAIN');
        const findNewReportsFn = new lambda.Function(this, 'findNewReports', {
            runtime: lambda.Runtime.NODEJS_14_X,
            code: lambda.Code.fromAsset(path.join(require.resolve('@lsp/findnewreports'), '../..')),
            handler: 'dist/find-new-reports.findNewReportsHandler',
            timeout: cdk.Duration.seconds(120),
            memorySize: 600,
            description: 'Logs into LSP and checks for new reports',
            environment: {
                REPORTS_TABLE: dynamoTable.tableName || '',
                PHOTOS_BUCKET: photosBucket.bucketName || '',
            },
        });
        usernameSecret.grantRead(findNewReportsFn);
        passwordSecret.grantRead(findNewReportsFn);
        domainSecret.grantRead(findNewReportsFn);
        dynamoTable.grantReadWriteData(findNewReportsFn);
        photosBucket.grantReadWrite(findNewReportsFn);
        photosBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.SnsDestination(photosTopic));

        // Mountain time can be between 6 and 7 hours offset from UTC.
        // These rules should trigger every 15 minutes between 2:00/3:00-5:45/6:45PM MON-FRI
        const findReportsTarget = new targets.LambdaFunction(findNewReportsFn as any);
        const findReportsRule1 = new events.Rule(this, 'findReportsRule1', {
            schedule: events.Schedule.expression('cron(0/15 21-23 ? * 2-6 *)'),
            description: 'Every 15 minutes between 9:00-11:45PM UTC MON-FRI',
        });
        findReportsRule1.addTarget(findReportsTarget);
        const findReportsRule2 = new events.Rule(this, 'findReportsRule2', {
            schedule: events.Schedule.expression('cron(0/15 0 ? * 3-7 *)'),
            description: 'Every 15 minutes between 12:00-12:45AM UTC TUE-SAT',
        });
        findReportsRule2.addTarget(findReportsTarget);

        findNewReportsFn
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
