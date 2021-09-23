// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { SecretsManager } from 'aws-sdk';

const secretsClient = new SecretsManager();
export default async function getSecretString(SecretId: string): Promise<string> {
    const data = await secretsClient.getSecretValue({ SecretId }).promise();
    if (!data.SecretString) {
        throw new Error(`Missing value for secret id: ${SecretId}`);
    }
    return data.SecretString;
}
