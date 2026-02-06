import json
import boto3

iam = boto3.client("iam")

DENY_POLICY_NAME = "BudgetExceeded-DenyAll"
DENY_POLICY_DOCUMENT = json.dumps({
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "DenyAllWhenBudgetExceeded",
            "Effect": "Deny",
            "Action": "*",
            "Resource": "*",
        }
    ],
})


def get_or_create_deny_policy():
    account_id = boto3.client("sts").get_caller_identity()["Account"]
    policy_arn = f"arn:aws:iam::{account_id}:policy/{DENY_POLICY_NAME}"
    try:
        iam.get_policy(PolicyArn=policy_arn)
        return policy_arn
    except iam.exceptions.NoSuchEntityException:
        response = iam.create_policy(
            PolicyName=DENY_POLICY_NAME,
            PolicyDocument=DENY_POLICY_DOCUMENT,
            Description="Denies all actions — attached automatically when budget is exceeded",
        )
        return response["Policy"]["Arn"]


def handler(event, context):
    print(f"Budget alert received: {json.dumps(event)}")

    policy_arn = get_or_create_deny_policy()

    users = iam.list_users()["Users"]
    for user in users:
        try:
            iam.attach_user_policy(UserName=user["UserName"], PolicyArn=policy_arn)
            print(f"Attached deny-all policy to user: {user['UserName']}")
        except Exception as e:
            print(f"Failed for user {user['UserName']}: {e}")

    groups = iam.list_groups()["Groups"]
    for group in groups:
        try:
            iam.attach_group_policy(GroupName=group["GroupName"], PolicyArn=policy_arn)
            print(f"Attached deny-all policy to group: {group['GroupName']}")
        except Exception as e:
            print(f"Failed for group {group['GroupName']}: {e}")

    return {
        "users_locked": [u["UserName"] for u in users],
        "groups_locked": [g["GroupName"] for g in groups],
        "policy_arn": policy_arn,
    }
