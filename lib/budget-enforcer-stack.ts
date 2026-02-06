import * as cdk from 'aws-cdk-lib/core';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import { Construct } from 'constructs';
import * as path from 'path';

export interface BudgetEnforcerStackProps extends cdk.StackProps {
  budgetLimitUsd?: number;
  notificationEmail: string;
}

export class BudgetEnforcerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BudgetEnforcerStackProps) {
    super(scope, id, props);

    const budgetLimit = props.budgetLimitUsd ?? 50;

    // SNS topic for budget alerts
    const budgetAlarmTopic = new sns.Topic(this, 'BudgetAlarmTopic', {
      topicName: 'BudgetAlarm-DenyAll',
    });

    // Email subscription for notifications
    budgetAlarmTopic.addSubscription(
      new snsSubscriptions.EmailSubscription(props.notificationEmail),
    );

    // Lambda function to enforce budget by attaching deny-all policy
    const enforcerFn = new lambda.Function(this, 'BudgetEnforcerFn', {
      functionName: 'BudgetEnforcer-DenyAll',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambda')),
      timeout: cdk.Duration.seconds(60),
      description: 'Attaches a deny-all IAM policy to all users/groups when budget is exceeded',
    });

    // Grant the Lambda permissions to manage IAM policies
    enforcerFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'iam:ListUsers',
          'iam:ListGroups',
          'iam:AttachUserPolicy',
          'iam:AttachGroupPolicy',
          'iam:CreatePolicy',
          'iam:GetPolicy',
        ],
        resources: ['*'],
      }),
    );

    enforcerFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['sts:GetCallerIdentity'],
        resources: ['*'],
      }),
    );

    // Subscribe Lambda to SNS topic
    budgetAlarmTopic.addSubscription(
      new snsSubscriptions.LambdaSubscription(enforcerFn),
    );

    // Allow AWS Budgets to publish to the SNS topic
    budgetAlarmTopic.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['SNS:Publish'],
        principals: [new iam.ServicePrincipal('budgets.amazonaws.com')],
        resources: [budgetAlarmTopic.topicArn],
        conditions: {
          StringEquals: {
            'aws:SourceAccount': this.account,
          },
        },
      }),
    );

    // AWS Budget with notifications
    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: `Monthly-${budgetLimit}USD-Limit`,
        budgetLimit: {
          amount: budgetLimit,
          unit: 'USD',
        },
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
      },
      notificationsWithSubscribers: [
        // Email at 50%
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 50,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [
            { subscriptionType: 'EMAIL', address: props.notificationEmail },
          ],
        },
        // Email at 80%
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [
            { subscriptionType: 'EMAIL', address: props.notificationEmail },
          ],
        },
        // SNS + Email at 100% — triggers Lambda to deny all
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [
            { subscriptionType: 'EMAIL', address: props.notificationEmail },
            { subscriptionType: 'SNS', address: budgetAlarmTopic.topicArn },
          ],
        },
        // Forecasted spend at 80%
        {
          notification: {
            notificationType: 'FORECASTED',
            comparisonOperator: 'GREATER_THAN',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [
            { subscriptionType: 'EMAIL', address: props.notificationEmail },
          ],
        },
      ],
    });

    // Outputs
    new cdk.CfnOutput(this, 'TopicArn', {
      value: budgetAlarmTopic.topicArn,
      description: 'SNS topic ARN for budget alerts',
    });

    new cdk.CfnOutput(this, 'LambdaFunctionArn', {
      value: enforcerFn.functionArn,
      description: 'Budget enforcer Lambda function ARN',
    });
  }
}
