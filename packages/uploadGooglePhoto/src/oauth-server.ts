// TODO: Move this to a postman script
// import '../../env';
// import express from 'express';
// import { google } from 'googleapis';
// import database from '../../db';

// const oauth2Client = new google.auth.OAuth2(
//     process.env.GOOGLE_CLIENT_ID,
//     process.env.GOOGLE_CLIENT_SECRET,
//     'http://localhost:3099/oauth2/callback',
// );

// const scopes = [
//     'https://www.googleapis.com/auth/photoslibrary.appendonly',
//     'https://www.googleapis.com/auth/photoslibrary.sharing',
//     'https://www.googleapis.com/auth/photoslibrary',
// ];

// const app = express();

// app.get('/', (req, res) => {
//     const url = oauth2Client.generateAuthUrl({
//         access_type: 'offline',
//         scope: scopes,
//     });
//     res.send(`<a href="${url}">Login</a>`);
// });

// app.get('/oauth2/callback', async (req, res, next) => {
//     const { code, error } = req.query;
//     const { tokens } = await oauth2Client.getToken(code.toString());
//     if (error) {
//         next(new Error(error.toString()));
//         return;
//     }
//     await database.saveData('tokens', tokens);
//     res.json(tokens);
// });

// app.listen(3099, () => {
//     console.log(`Example app listening at http://localhost:${3099}`);
// });
