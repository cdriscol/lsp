import AWS from 'aws-sdk';
import fetch from 'node-fetch';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { getSecretString } from '@lsp/common';
const s3 = new AWS.S3();

interface IUploadArgs {
    fileName: string;
    fileBuffer: any;
    requestTimeout?: number;
    token: string;
}

interface IPostArgs {
    endpoint: string;
    body: any;
    token: string;
}

interface IUploadPhotoArgs extends IUploadArgs {
    albumId?: string;
    description?: string;
}

export const uploadGooglePhotoHandler = async (event: any) => {
    console.info('uploadGooglePhotoHandler.event', JSON.stringify(event, null, 2));
    const clientId = await getSecretString('GOOGLE_CLIENT_ID');
    const clientSecret = await getSecretString('GOOGLE_CLIENT_SECRET');
    const albumId = await getSecretString('GOOGLE_PHOTOS_ALBUM_ID');

    // oauthCallback wont be called in this workflow
    // just needs to match config in Google Cloud
    const oauthCallback = 'http://localhost:3099/oauth2/callback';

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, oauthCallback);
    const token = await getPhotosAccessToken(oauth2Client);
    const qRecords = event?.Records;

    for (const qRecord of qRecords) {
        const snsRecord = JSON.parse(qRecord?.body);
        const s3EventRecords = JSON.parse(snsRecord.Message)?.Records;

        for (const record of s3EventRecords) {
            const bucket = record.s3.bucket.name;
            const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
            const params = { Bucket: bucket, Key: key };

            try {
                const { Body: fileBuffer } = await s3.getObject(params).promise();
                const fileName = key;
                const uploadArgs = {
                    token,
                    fileName,
                    fileBuffer: fileBuffer as Buffer,
                    albumId,
                };
                const response = await uploadPhoto(uploadArgs);
                console.info('Google Photos reponse', response);
            } catch (err) {
                console.error(err);
                const message = `Error getting object ${key} from bucket ${bucket}. Make sure they exist and your bucket is in the same region as this function.`;
                throw new Error(message);
            }
        }
    }
};

async function getPhotosAccessToken(oauth2Client: OAuth2Client): Promise<string> {
    const refresh_token = await getSecretString('GOOGLE_REFRESH_TOKEN');
    oauth2Client.setCredentials({ refresh_token });

    oauth2Client.on('tokens', (newTokens: any) => {
        oauth2Client.setCredentials(newTokens);
    });

    const { token } = await oauth2Client.getAccessToken();
    return token;
}

async function upload({ fileName, fileBuffer, token }: IUploadArgs) {
    const response = await fetch('https://photoslibrary.googleapis.com/v1/uploads', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/octet-stream',
            Authorization: `Bearer ${token}`,
            'X-Goog-Upload-File-Name': fileName,
            'X-Goog-Upload-Protocol': 'raw',
        },
        body: fileBuffer,
    });

    return response.text();
}

function post({ endpoint, body, token }: IPostArgs) {
    return fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
}

async function createAlbum({ title, token }: { title: string; token: string }): Promise<string> {
    const response = await post({
        endpoint: 'https://photoslibrary.googleapis.com/v1/albums',
        token,
        body: {
            album: {
                title,
                isWriteable: true,
            },
        },
    });
    const album: any = await response.json();
    console.debug('Created Google Photos Album', album);
    return album.id;
}

async function uploadPhoto({
    albumId: incomingAlbumId,
    fileName,
    token,
    fileBuffer,
    requestTimeout = 10000,
}: IUploadPhotoArgs): Promise<any> {
    const albumId = incomingAlbumId || (await createAlbum({ token, title: 'LSP Photos' }));
    const uploadToken = await upload({ fileName, fileBuffer, requestTimeout, token });
    const batchCreateResponse = await post({
        token,
        endpoint: 'https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate',
        body: {
            albumId,
            newMediaItems: [
                {
                    simpleMediaItem: { uploadToken },
                },
            ],
            albumPosition: {
                position: 'FIRST_IN_ALBUM',
            },
        },
    });

    const batchCreateJson: any = await batchCreateResponse.json();
    return batchCreateJson?.newMediaItemResults?.[0]?.mediaItem;
}
