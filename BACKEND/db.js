const mysql = require('mysql2');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'SQLmzs2006', // Ensure this matches your XAMPP password (often empty)
    database: 'ssuet_qr_library'
});

module.exports = pool.promise();