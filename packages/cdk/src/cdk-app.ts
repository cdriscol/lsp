#!/usr/bin/env node
import * as cdk from '@aws-cdk/core';
import { LSPStack } from './lsp-stack';

const app = new cdk.App();
new LSPStack(app, 'LSPStack', { description: 'Scrapes daily reports from LSP into DynamoDB and S3' });
