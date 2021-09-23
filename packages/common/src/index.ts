import getSecretString from './get-secret-string';

export const formatReportKey = (first_name: string): string => `Report:${first_name.toLowerCase().trim()}`;

export { getSecretString };
