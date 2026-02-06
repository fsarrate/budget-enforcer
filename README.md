# AWS Budget Enforcer

**Stop surprise AWS bills.** This CDK stack automatically locks down your AWS account when your monthly spending exceeds a defined budget — no manual intervention needed.

## The Problem

AWS Budgets can send you email alerts, but they **won't stop your resources from running**. By the time you read the email, you could already be hundreds of dollars over budget. This is a common pain point for personal accounts, side projects, and learning environments where a forgotten EC2 instance or a misconfigured service can silently drain your wallet.

## The Solution

This project deploys a fully automated budget enforcement pipeline:

```
AWS Budget → SNS Topic → Lambda → Deny-All IAM Policy
```

When your spending crosses the threshold, a Lambda function automatically attaches a **Deny-All IAM policy** to every IAM user and group in your account, effectively freezing all API activity. Your root account remains unaffected, so you can always log in and undo the lockdown.

## How It Works

| Threshold | Action |
|-----------|--------|
| **50%** of budget | Email notification |
| **80%** of budget | Email notification |
| **80%** forecasted | Email notification (based on spending trend) |
| **100%** of budget | Email notification **+ Lambda triggers deny-all policy** |

### Architecture

```
                          ┌──────────────┐
                          │  AWS Budget  │
                          │  (Monthly)   │
                          └──────┬───────┘
                                 │
                    50%, 80%     │     100%
                   ┌─────────────┼─────────────┐
                   │             │             │
                   v             v             v
              ┌─────────┐  ┌─────────┐  ┌───────────┐
              │  Email   │  │  Email   │  │ SNS Topic │
              │  Alert   │  │  Alert   │  └─────┬─────┘
              └─────────┘  └─────────┘        │
                                         ┌────┴────┐
                                         │         │
                                         v         v
                                    ┌────────┐ ┌────────┐
                                    │ Email  │ │ Lambda │
                                    │ Alert  │ └───┬────┘
                                    └────────┘     │
                                                   v
                                          ┌──────────────┐
                                          │  Deny-All    │
                                          │  IAM Policy  │
                                          │  attached to │
                                          │  all users & │
                                          │  groups      │
                                          └──────────────┘
```

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [AWS CDK CLI](https://docs.aws.amazon.com/cdk/latest/guide/cli.html) (`npm install -g aws-cdk`)
- AWS CLI configured with credentials (`aws configure`)
- CDK bootstrapped in your account/region (`cdk bootstrap`)

## Quick Start

**1. Clone the repository**

```bash
git clone https://github.com/fsarrate/budget-enforcer.git
cd budget-enforcer
```

**2. Install dependencies**

```bash
npm install
```

**3. Configure your environment**

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
NOTIFICATION_EMAIL=your-email@example.com
BUDGET_LIMIT_USD=50
```

**4. Deploy**

```bash
cdk deploy
```

You will receive a confirmation email from SNS — **make sure to confirm the subscription** to receive budget alerts.

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `NOTIFICATION_EMAIL` | Email address for budget alerts | *(required)* |
| `BUDGET_LIMIT_USD` | Monthly budget limit in USD | `50` |

## Recovering from a Lockdown

When the budget is exceeded, the Lambda attaches a policy called `BudgetExceeded-DenyAll` to every IAM user and group in your account. This effectively blocks all API calls for those identities.

> **You must use the root account to revert this.** IAM users are blocked by the deny-all policy, but the root account is never affected by IAM policies.

### Option 1: AWS Console

1. Sign in to the [AWS Console](https://console.aws.amazon.com/) **as the root user**
2. Go to **IAM > Policies** and find `BudgetExceeded-DenyAll`
3. Click the **Entities attached** tab
4. Detach the policy from all listed users and groups
5. Optionally delete the policy

### Option 2: AWS CLI

Authenticate as root, then run:

```bash
# 1. See which users and groups have the policy attached
aws iam list-entities-for-policy \
  --policy-arn arn:aws:iam::<ACCOUNT_ID>:policy/BudgetExceeded-DenyAll

# 2. Detach from each user
aws iam detach-user-policy \
  --user-name <USERNAME> \
  --policy-arn arn:aws:iam::<ACCOUNT_ID>:policy/BudgetExceeded-DenyAll

# 3. Detach from each group
aws iam detach-group-policy \
  --group-name <GROUPNAME> \
  --policy-arn arn:aws:iam::<ACCOUNT_ID>:policy/BudgetExceeded-DenyAll

# 4. (Optional) Delete the policy entirely
aws iam delete-policy \
  --policy-arn arn:aws:iam::<ACCOUNT_ID>:policy/BudgetExceeded-DenyAll
```

Replace `<ACCOUNT_ID>` with your AWS account ID (e.g. `123456789012`).

## Important Caveats

- **Root account is never locked.** The deny-all policy only applies to IAM users and groups, not the root account.
- **Already-running resources won't stop.** The policy prevents new API calls but doesn't terminate existing EC2 instances, RDS databases, etc. You'll need to stop those manually.
- **Budget alerts have a delay.** AWS Budgets updates spending data a few times per day, not in real-time. There may be a lag between actual spend and enforcement.
- **Confirm your SNS subscription.** After deploying, check your email and confirm the SNS subscription — otherwise you won't receive alerts.

## Tearing Down

To remove all resources created by this stack:

```bash
cdk destroy
```

If the deny-all policy was already attached to users/groups, detach it manually first (see [Recovering from a Lockdown](#recovering-from-a-lockdown)).

## License

MIT
