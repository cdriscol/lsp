# Google Photos handler
Downloads images from LSP and uploads them to Google Photos album.

## Creating a Google Client App
You'll need to create an app with the proper scopes to use this handler. More information can be found [here](https://developers.google.com/photos/library/guides/get-started).

Once you create your application, you should receive the `Client ID` and `Client Secret` which need to be set as environment variables.

## Secrets
| Name  | Description |
| ------------- | ------------- |
| GOOGLE_CLIENT_ID  | Your Google client ID  |
| GOOGLE_CLIENT_SECRET  | Your Google client secret  |
| PHOTOS_ALBUM_ID  | Your Google Photos album ID to upload photos to  |

## Obtaining access tokens
Refresh and access tokens need to be seeded into the database. To do this, there is an included `oauth-server.ts` you can run.

```bash
$ yarn google-server
```

This should log out a URL you can navigate to in a browser and login to your Google App. Once you have successfully logged in, your first tokens should be stored in the database.

### Postman tokens
You can also use [Postman to generate the initial OAuth refresh token](https://learning.postman.com/docs/sending-requests/authorization/#oauth-20).