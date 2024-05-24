const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

const config = require("./config");

const otpEmail = (email, otp) => {
	var params = {
		Source: config.NO_REPLY_EMAIL,
		Destination: { ToAddresses: [email] },
		Message: {
			Subject: { Charset: "UTF-8", Data: `Onlie OTP is ${otp}` },
			Body: {
				Html: {
					Charset: "UTF-8",
					Data: `Hello,<br/><br/>Your one-time password to log in to your Onlie account is: <b>${otp}</b><br/><br/>Note: This OTP is only valid for next 15 minutes.<br/><br/>Thanks<br/>`,
				},
				Text: {
					Charset: "UTF-8",
					Data: `Hello,\n\nYour one-time password to log in to your Onlie account is: ${otp}\n\nNote: This OTP is only valid for next 15 minutes.\n\nThanks\n`,
				},
			},
		},
	};
	sendEmail(params);
};

const sendEmail = async (params) => {
	const client = new SESClient({
		region: "us-west-2",
		credentials: {
			accessKeyId: config.AWS_ACCESS_KEY,
			secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
		},
	});
	const command = new SendEmailCommand(params);
	const response = await client.send(command);
	return response;
};

module.exports = { otpEmail };
