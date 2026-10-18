const mysql = require('mysql');
const database = {
    host : 'localhost',
    user : 'tele2627',
    password : '2627tele',
    database : 'telemedicina2627'
};

const conexion = mysql.createConnection(database);

conexion.connect(function (err) {
    if (err) {
        console.error('Error en la conexión de la base de datos:',err);
        process.exit();
    }

    console.log('Conexión con MySQL correcta');
});

module.exports = conexion;