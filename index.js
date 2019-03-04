global.fetch = require('node-fetch');

const AWS = require('aws-sdk');
const sigV4Client = require('./sigV4Client');
const { CognitoUserPool, AuthenticationDetails, CognitoUser } = require('amazon-cognito-identity-js');
const axios = require('axios');


const USER_POOL_ID = 'YOUR_USER_POOL_ID';
const APP_CLIENT_ID = 'YOUR_APP_CLIENT_ID';
const IDENTITY_POOL_ID = 'YOUR_IDENTITY_POOL_ID';
const REGION = 'REGION';
const API_GATEWAY_URL = 'API_GATEWAY_URL_WITH_STAGE';

const userName = 'YOUR_USER_NAME';
const password = 'YOUR_PASSWORD';

function login() {
    const userPool = new CognitoUserPool({
        UserPoolId: USER_POOL_ID,
        ClientId: APP_CLIENT_ID
    });
    const user = new CognitoUser({ Username: userName, Pool: userPool });
    const authenticationData = { Username: userName, Password: password };
    const authenticationDetails = new AuthenticationDetails(authenticationData);

    return new Promise((resolve, reject) =>
        user.authenticateUser(authenticationDetails, {
            onSuccess: result => resolve(),
            onFailure: err => reject(err)
        })
    );
}

function getUserToken(currentUser) {
    return new Promise((resolve, reject) => {
        currentUser.getSession(function (err, session) {
            if (err) {
                reject(err);
                return;
            }
            resolve(session.getIdToken().getJwtToken());
        });
    });
}

function getCurrentUser() {
    const userPool = new CognitoUserPool({
        UserPoolId: USER_POOL_ID,
        ClientId: APP_CLIENT_ID
    });
    return userPool.getCurrentUser();
}

function getAwsCredentials(userToken) {
    const authenticator = `cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`;

    AWS.config.update({ region: REGION });

    AWS.config.credentials = new AWS.CognitoIdentityCredentials({
        IdentityPoolId: IDENTITY_POOL_ID,
        Logins: {
            [authenticator]: userToken
        }
    });

    return AWS.config.credentials.getPromise();
}

function invokeApig({ path, method = "GET", headers = {}, queryParams = {}, body }) {
    return new Promise((resolve, reject) => {
        login()
            .then(() => getCurrentUser())
            .then((currentUser) => getUserToken(currentUser))
            .then((userToken) => getAwsCredentials(userToken))
            .then(() => {
                const signedRequest = sigV4Client
                    .newClient({
                        accessKey: AWS.config.credentials.accessKeyId,
                        secretKey: AWS.config.credentials.secretAccessKey,
                        sessionToken: AWS.config.credentials.sessionToken,
                        region: REGION,
                        endpoint: API_GATEWAY_URL
                    })
                    .signRequest({
                        method,
                        path,
                        headers,
                        queryParams,
                        body
                    });

                body = body ? JSON.stringify(body) : body;
                headers = signedRequest.headers;

                return axios(signedRequest.url, { method, headers, body })
            })
            .then((result) => {
                console.log(result.data);
            })
            .catch((error) => {
                console.log(error.message, error.response.data.Message);
            });
    });
}

invokeApig({ path: `/service/`, });
// invokeApig({ path: `/service/18e12d3f-6cea-4444-a1c5-e308fb355e24/`, });