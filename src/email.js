const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

const config = require("./config");

const verificationEmail = (username, email, code) => {
	const verificartionEmailLink = `${config.URL}api/verify/${code}`;

	const params = {
		Source: config.NO_REPLY_EMAIL,
		Destination: { ToAddresses: [email] },
		Message: {
			Subject: { Charset: "UTF-8", Data: `Please verify your email` },
			Body: {
				Html: {
					Charset: "UTF-8",
					Data: `Hello @${username},<br/><br/>Please click on the link below to verify your email.<br/><a href="${verificartionEmailLink}" target='_blank'>${verificartionEmailLink}</a><br/><br/>Thanks<br/>`,
				},
				Text: {
					Charset: "UTF-8",
					Data: `Hello @${username},\n\nPlease click on the link below to verify your email.\n${verificartionEmailLink}\n\nThanks\n`,
				},
			},
		},
	};
	sendEmail(params);
};

const resetPasswordEmail = (email, password) => {
	var params = {
		Source: config.NO_REPLY_EMAIL,
		Destination: { ToAddresses: [email] },
		Message: {
			Subject: { Charset: "UTF-8", Data: `Your password has been resetted.` },
			Body: {
				Html: {
					Charset: "UTF-8",
					Data: `Hello,<br/><br/>Your password to log in to your Onlie account is: <b>${password}</b><br/><br/>Note: Please change your password immediately after logging in.<br/><br/>Thanks<br/>`,
				},
				Text: {
					Charset: "UTF-8",
					Data: `Hello,\n\nYour password to log in to Onlie account is: ${password}\n\nNote: Please change your password immediately after logging in.\n\nThanks\n`,
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

module.exports = { verificationEmail, resetPasswordEmail };
