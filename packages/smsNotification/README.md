# Twilio SMS Handler
This is currently configured to send an SMS anytime there is something needed to bring to LSP for a child.

## Setup Twilio
You can setup a [free Twilio account](https://www.twilio.com/docs/usage/tutorials/how-to-use-your-free-trial-account) for this

## Secrets
| Name  | Description |
| --- | --- |
| TWILIO_AUTH_TOKEN  | Your Twilio auth token |
| TWILIO_ACCOUNT_SID  | Your Twilio account sid  |
| SMS_NUMBERS  | Phone numbers you want to send SMS to (separated by `,`)  |
| TWILIO_FROM_NUMBER | Phone number to send SMS from |