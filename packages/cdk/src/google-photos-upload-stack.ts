// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config();
import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as s3 from '@aws-cdk/aws-s3';
import * as sns from '@aws-cdk/aws-sns';
import * as sqs from '@aws-cdk/aws-sqs';
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';
import * as subscriptions from '@aws-cdk/aws-sns-subscriptions';
import { SqsEventSource } from '@aws-cdk/aws-lambda-event-sources';
import * as actions from '@aws-cdk/aws-cloudwatch-actions';
import { Construct } from '@aws-cdk/core';

const getSecretByName = (scope: Construct, name: string): secretsmanager.ISecret =>
    secretsmanager.Secret.fromSecretNameV2(scope, name, name);

export class GooglePhotosUploadStack extends cdk.Stack {
    constructor(
        scope: cdk.Construct,
        id: string,
        photosTopic: sns.Topic,
        photosBucket: s3.Bucket,
        errorsTopic: sns.Topic,
        props?: cdk.StackProps,
    ) {
        super(scope, id, props);

        // Google photos upload
        const googleClientIdSecret = getSecretByName(this, 'GOOGLE_CLIENT_ID');
        const googleClientSecretSecret = getSecretByName(this, 'GOOGLE_CLIENT_SECRET');
        const googleRefreshTokenSecret = getSecretByName(this, 'GOOGLE_REFRESH_TOKEN');
        const googlePhotoAlbumIdSecret = getSecretByName(this, 'GOOGLE_PHOTOS_ALBUM_ID');
        const googlePhotosDeadLetterQueue = new sqs.Queue(this, 'google-photos-dlq');
        const googlePhotosQueue = new sqs.Queue(this, 'google-photos-queue', {
            deadLetterQueue: { queue: googlePhotosDeadLetterQueue, maxReceiveCount: 5 },
        });
        photosTopic.addSubscription(new subscriptions.SqsSubscription(googlePhotosQueue));
        const uploadGooglePhotoFn = new lambda.Function(this, 'uploadGooglePhoto', {
            runtime: lambda.Runtime.NODEJS_14_X,
            code: lambda.Code.fromAsset(path.join(require.resolve('@lsp/uploadgooglephoto'), '../..')),
            handler: 'dist/upload-google-photo.uploadGooglePhotoHandler',
            memorySize: 180,
            description: 'Uploads photos from S3 to a Google Photos album',
            timeout: cdk.Duration.seconds(15),
        });
        googleClientIdSecret.grantRead(uploadGooglePhotoFn);
        googleClientSecretSecret.grantRead(uploadGooglePhotoFn);
        googleRefreshTokenSecret.grantRead(uploadGooglePhotoFn);
        googlePhotoAlbumIdSecret.grantRead(uploadGooglePhotoFn);

        photosBucket.grantRead(uploadGooglePhotoFn);
        uploadGooglePhotoFn.addEventSource(new SqsEventSource(googlePhotosQueue));

        uploadGooglePhotoFn
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
