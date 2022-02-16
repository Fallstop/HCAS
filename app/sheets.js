const {google} = require('googleapis');
const fs = require('fs');
const moment = require('moment');
const path = require('path');

const requireEnv = (value, env) => {
    if (!value) { // Make sure the value is present
        console.error(`ERROR "${env}" IS NOT DEFINED IN ENVIRONMENT VARIABLES`); // Warn the user
        process.exit(1); // Exit the process
        return '';
    } else {
        return value; // Return the value
    }
}

// The access scope for our google api request
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']; // We only need the readonly scope because we aren't doing any writing

// Load and ensure that we have the required environment variables
const JWT_TOKEN_PATH = requireEnv(process.env.JWT_TOKEN_PATH, 'JWT_TOKEN_PATH');

// JWT Credentials
const JWT_CREDENTIALS_KEY = requireEnv(process.env.JWT_CREDENTIALS_KEY, 'JWT_CREDENTIALS_KEY');
const JWT_CREDENTIALS_EMAIL = requireEnv(process.env.JWT_CREDENTIALS_EMAIL, 'JWT_CREDENTIALS_EMAIL');

// Cache file data
const CACHE_FILE_PATH = requireEnv(process.env.CACHE_FILE_PATH, 'CACHE_FILE_PATH');
const CACHE_EXPIRE_TIME = parseInt(process.env.CACHE_EXPIRE_TIME) || 1

// Files resolved from the environment variables
const jwtTokenFile = path.join(JWT_TOKEN_PATH, 'token.json');
const cacheFile = path.join(CACHE_FILE_PATH, 'cache.json');

// Authorize with JWT
const authorize = () => new Promise((resolve, reject) => {
    // Create a new JWT client with the credentials
    const jwtClient = new google.auth.JWT({
        email: JWT_CREDENTIALS_EMAIL,
        key: JWT_CREDENTIALS_KEY,
        scopes: SCOPES
    });
    if (!fs.existsSync(JWT_TOKEN_PATH)) { // Make sure the token path directory exists
        fs.mkdirSync(JWT_TOKEN_PATH, {recursive: true}); // Create the directory structure if it doesn't
    }
    // Read the JWT Token file
    fs.readFile(jwtTokenFile, (err, tokenFileData) => {
        if (err != null) { // If we failed to read the file or it doesn't exist
            console.debug('Authorizing with JWT'); // Debug messaging
            // Generate new token
            jwtClient.authorize((err, tokenData) => {
                if (err != null) { // If we failed to authorize with JWT
                    console.error('ERROR Failed to authorize with JWT: ' + err);
                    reject(); // Reject the promise
                } else {
                    const tokenString = JSON.stringify(tokenData)
                    // Write the JWT token to its file
                    fs.writeFile(jwtTokenFile, tokenString, err => {
                        if (err) { // If we failed to write to the file
                            // Warn the user
                            console.error(`ERROR Failed to write JWT token to "${jwtTokenFile}": ${err}`)
                        }
                    });
                    // Resolve with the JWT client
                    resolve(jwtClient);
                }
            });
        } else {
            // Parse the JWT token from the JSON file
            const tokenData = JSON.parse(tokenFileData.toString('utf-8'));
            // Set the JWT credentials to the token
            jwtClient.setCredentials(tokenData);
            // Resolve with the JWT client
            resolve(jwtClient);
        }
    });
});

// Retrieve the range data from a google sheet
const fetchGoogleSheet = (jwtClient, spreadsheetId, rangeName) => new Promise(resolve => {
    const sheets = google.sheets({version: 'v4', auth: jwtClient});
    sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: rangeName
    }, {}, (err, result) => {
        if (err != null) { // If we failed to retrieve the data
            // Warn the user
            console.error(`ERROR Failed to retrieve google sheet ID "${spreadsheetId} RANGE "${rangeName}": ${err}`);
            // Resolve with empty array
            resolve([]);
        } else {
            const rows = result.data.values; // Get the result rows
            if (rows.length) { // Ensure we have rows
                // Map the data to its first value so we only get
                // a single array not an array of arrays
                const data = rows.map(row => row[0]);
                // Resolve with the data array
                resolve(data);
            }
        }
    });
});

// Load the cache expiry file (this tells us when its due to expire)
const loadCacheExpiry = () => new Promise(resolve => {
    // Read the cache expiry file
    fs.readFile(cacheFile + '.expiry', (err, data) => {
        if (err != null) { // If we failed to read the file or it doesn't exist
            resolve(null); // Resolve with null
        } else {
            data = data.toString('utf-8'); // Convert the loaded data to a string
            resolve(moment(data)); // Resolve with the data as moment object
        }
    });
});

// Save the provided data to the cache file
const saveCache = data => {
    if (!fs.existsSync(CACHE_FILE_PATH)) { // Make sure the cache directory exists
        fs.mkdirSync(CACHE_FILE_PATH, {recursive: true}); // Create the directory structure if it doesn't
    }
    data = JSON.stringify(data); // Serialize the data
    // Write the data to the cache file
    fs.writeFile(cacheFile, data, err => {
        if (err != null) { // If we failed to write the cache file
            // Warn the user
            console.error('ERROR Failed to save cache file: ' + err);
        } else {
            // Calculate the expiry date
            const expiry = moment().add(CACHE_EXPIRE_TIME, 'hour')
            // Write the expiry date to the app.json.expiry file
            fs.writeFile(cacheFile + '.expiry', expiry.toISOString(), err => {
                if (err != null) { // If we failed to write the cache expiry file
                    // Warn the user
                    console.error('ERROR Failed to save cache file time: ' + err)
                }
            });
        }
    });
}

const clearCache = () => {
    fs.rmSync(cacheFile);
    fs.rmSync(cacheFile + '.expiry');
}

// Loads the cache file data
const loadCache = () => new Promise((resolve, reject) => {
    // Read the cache file
    fs.readFile(cacheFile, (err, data) => {
        if (err != null) { // If we failed to read the file or it doesn't exist
            // Warn the user
            console.error('ERROR Failed to load cache file: ' + err);
            reject(); // Reject the promise
        } else {
            // Parse the JSON data of the file
            data = JSON.parse(data.toString('utf-8'));
            resolve(data); // Resolve with the data
        }
    });
});

// Get the list of member names
const getNameList = () => new Promise(resolve => {
    loadCacheExpiry().then(cacheExpiry => {
        let isExpired;
        if (cacheExpiry == null) {
            isExpired = true;
        } else {
            const now = moment();
            // IDE doesn't know `cacheExpiry` is a moment object
            // noinspection JSCheckFunctionSignatures
            isExpired = !now.isBefore(cacheExpiry);
        }
        const fromCache = () => {
            loadCache().then(data => {
                resolve({data, cached: true})
            }).catch(() => {
                console.warn('WARNING Failed to load cache defaulting to empty');
                resolve({data: [], cached: true});
            });
        }
        if (!isExpired) {
            fromCache();
        } else {
            authorize().then(jwtClient => {
                const youthPromise = fetchGoogleSheet(
                    jwtClient,
                    process.env.YOUTH_SHEET_ID,
                    process.env.YOUTH_RANGE_NAME
                );
                Promise.resolve(youthPromise).then(responses => {
                    if (responses.length > 0) {
                        saveCache(responses);
                    }
                    resolve({data: responses, cached: false});
                });
            }).catch(() => {
                console.warn(`WARNING Failed to authorize with JWT defaulting to old cache from "${cacheExpiry}"`)
                fromCache();
            });
        }
    });
});

module.exports = {
    getNameList,
    clearCache
}