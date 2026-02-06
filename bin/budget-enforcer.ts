#!/usr/bin/env node
import 'dotenv/config';
import * as cdk from 'aws-cdk-lib/core';
import { BudgetEnforcerStack } from '../lib/budget-enforcer-stack';

const app = new cdk.App();

const email = process.env.NOTIFICATION_EMAIL;
if (!email) {
  throw new Error('NOTIFICATION_EMAIL environment variable is required. Set it in .env file.');
}
const budgetLimit = Number(process.env.BUDGET_LIMIT_USD) || 50;

new BudgetEnforcerStack(app, 'BudgetEnforcerStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  notificationEmail: email,
  budgetLimitUsd: budgetLimit,
});
