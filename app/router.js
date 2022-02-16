const sheets = require('./sheets');
const moment = require('moment');

module.exports = (app, database) => {

    // Handle GET requests to /
    app.get('/', (req, res) => {
        // Render the index page
        res.render('index', {title: 'Home'});
    });

    // Handle GET requests to /members
    app.get('/members', (req, res) => {
        // Fetch the members from google sheets
        sheets.getNameList().then(result => {
            // Response with a success and the members
            res.json({
                status: "success",
                members: result.data,
                cached: result.cached
            });
        }).catch(() => {
            // Response with a failure
            res.json({
                "status": "failed"
            })
        });
    });

    app.get('/attendance', (req, res) => {
        let date = req.query.date; // Get the date provided via the request query (can be undefined)
        if (date && date.match(/[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}/)) date = moment(date); // Get the moment representation of the date;
        else date = moment(); // If we aren't given a date just use the current one
        const dateFormat = 'YYYY-MM-DD'; // The date format used in HTML
        database.getAttending(date).then(data => {
            res.json({
                status: "success",
                members: data,
                cached: false
            });
        })
    })

    // Handle GET requests to /attending
    app.get('/attending', (req, res) => {
        let date = req.query.date; // Get the date provided via the request query (can be undefined)
        if (date && date.match(/[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}/)) date = moment(date); // Get the moment representation of the date;
        else date = moment(); // If we aren't given a date just use the current one
        const dateFormat = 'YYYY-MM-DD'; // The date format used in HTML
        // Fetch the attending names
        database.getAttending(date).then(data => {
            // Render the attending page with the attendance data
            res.render('attending', {
                title: 'Attendance',
                data,
                date: date.format(dateFormat)
            });
        }).catch(() => {
            // Render the attending page with an empty array of data
            // because we couldn't retrieve the data
            res.render('attending', {
                title: 'Attendance',
                data: [],
                date: date.format(dateFormat)
            });
        });
    });

    // Handle POST requests to /attendance
    app.post('/attendance', (req, res) => {
        const body = req.body; // Get the request body
        // Make sure the body has the required data
        if (body.hasOwnProperty("name") && body.hasOwnProperty("member")) {
            const name = body.name; // The name provided
            const member = body.member === 'true'; // The member state
            // Check whether or not the name is attending
            database.isAttending(name).then(attending => {
                if (!attending) { // Make sure the person isn't already attending
                    // Add the attendance to the database
                    database.addAttendance(name, member)
                        .then(() => res.json({status: 'success'}))
                        .catch(() => res.json({status: 'failed'}))
                } else {
                    // The user is already marked so let the user know
                    // and fail the request
                    res.json({
                        status: 'failed',
                        reason: 'Already marked as attending'
                    })
                }
            }).catch(() => res.json({status: 'failed'}));
        } else { // Send a failed response because we were missing data
            res.json({status: 'failed'});
        }
    });

    // Handle DELETE request to /attendance
    app.delete('/attendance', (req, res) => {
        const body = req.body; // Get the request body
        // Make sure the body has the required data
        if (body.hasOwnProperty("name")) {
            const name = body.name; // The name provided
            // Remove the attendance
            database.removeAttendance(name)
                .then(() => res.json({status: 'success'}))
                .catch(() => res.json({status: 'failed'}))
        } else { // Send a failed response because we were missing data
            res.json({status: 'failed'})
        }
    });

    // Handle GET request to /clear-cache
    app.get('/clear-cache', (req, res) => {
        // Clear the google sheets cache
        sheets.clearCache();
        // Send a success response no matter what
        res.json({status: 'success'});
    });

    // Redirect any unknown urls to the home page
    app.use((req, res) => {
        res.redirect('/'); // Redirect
    });

}