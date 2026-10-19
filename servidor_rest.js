// Servidor REST del gestor adaptado a Supabase (siguiendo el ejemplo de clase).
// La clave anon es publica, pero nunca incluyas aqui una service_role o secret key.
var express = require("express");
var jwt = require("jwt-simple");
const { createClient } = require("@supabase/supabase-js");
var app = express();

const supabaseUrl = "https://mbmutjpvohzcggcpmuiv.supabase.co";
const supabaseKey = "sb_publishable_lc8G9zTZUe9oyq7v1Y3Luw_A-x20o3E";
const supabase = createClient(supabaseUrl, supabaseKey);

var clave = "miSecretoMasOscuro";

app.use("/apiGestor", express.static("cliente_rest"));
app.use(express.json());

function esNombreOApellidosValido(texto) {
    if (typeof texto !== "string") return false;
    var t = texto.trim();
    return t.length >= 2 && /^[\p{L}]+(?:[ \-'][\p{L}]+)*$/u.test(t);
}

app.get("/", function (req, res) {
    res.redirect("/apiGestor/");
});

// Rutas públicas: login y registro
app.post("/api/gestores/login", async function (req, res) {
    var login = req.body && req.body.login;
    var password = req.body && req.body.password;
    if (typeof login !== "string" || typeof password !== "string") {
        return res.status(400).json("Faltan credenciales");
    }
    try {
        var resultado = await supabase.from("gestores")
            .select("id")
            .eq("usuario", login)
            .eq("password", password);
        if (resultado.error) throw resultado.error;
        if (resultado.data.length !== 1) return res.status(403).send("Login incorrecto");

        var idGestor = resultado.data[0].id;
        var token = jwt.encode({
            usuario: idGestor,
            expira: Date.now() + 60 * 60 * 1000
        }, clave);
        return res.status(200).json({ id: idGestor, token: token });
    } catch (err) {
        console.error("Error en login:", err);
        return res.status(500).json("Error al realizar la consulta");
    }
});

app.post("/api/gestores", async function (req, res) {
    var nuevo = req.body;
    if (!nuevo || !nuevo.nombre || !nuevo.apellidos || !nuevo.usuario || !nuevo.password) {
        return res.status(400).send("Faltan campos");
    }
    if (!esNombreOApellidosValido(nuevo.nombre)) return res.status(400).send("Nombre inválido");
    if (!esNombreOApellidosValido(nuevo.apellidos)) return res.status(400).send("Apellidos inválidos");
    try {
        var existente = await supabase.from("gestores").select("id").eq("usuario", nuevo.usuario);
        if (existente.error) throw existente.error;
        if (existente.data.length > 0) return res.status(403).send("Usuario ya existe");

        var insertado = await supabase.from("gestores").insert({
            nombre: nuevo.nombre.trim(),
            apellidos: nuevo.apellidos.trim(),
            usuario: nuevo.usuario,
            password: nuevo.password
        }).select("id").single();
        if (insertado.error) {
            if (insertado.error.code === "23505") return res.status(403).send("Usuario ya existe");
            throw insertado.error;
        }
        return res.status(201).json({ id: insertado.data.id });
    } catch (err) {
        console.error("Error registrando gestor:", err);
        return res.status(500).json("Error al realizar la consulta");
    }
});

// Middleware JWT; todas las rutas privadas quedan debajo.
app.use("/api", function (req, res, next) {
    var token = req.query.token;
    if (!token) return res.status(401).json("No se ha encontrado token");
    var contenidoToken;
    try {
        contenidoToken = jwt.decode(token, clave);
    } catch (err) {
        return res.status(401).json("El token es incorrecto");
    }
    if (!contenidoToken || !contenidoToken.expira || !contenidoToken.usuario) {
        return res.status(401).json("El formato del token no es adecuado");
    }
    if (contenidoToken.expira < Date.now()) return res.status(401).json("El token ha expirado");
    req.idGestor = contenidoToken.usuario;
    next();
});

// Consultas de catálogos
app.get("/api/ubicaciones", async function (req, res) {
    try {
        var r = await supabase.from("ubicaciones").select("*").order("id");
        if (r.error) throw r.error;
        res.status(200).json(r.data);
    } catch (err) { console.error(err); res.status(500).json("Error al realizar la consulta"); }
});
app.get("/api/categorias", async function (req, res) {
    try {
        var r = await supabase.from("categorias").select("*").order("id");
        if (r.error) throw r.error;
        res.status(200).json(r.data);
    } catch (err) { console.error(err); res.status(500).json("Error al realizar la consulta"); }
});
app.get("/api/modelos", async function (req, res) {
    try {
        var r = await supabase.from("modelos").select("*").order("id");
        if (r.error) throw r.error;
        res.status(200).json(r.data);
    } catch (err) { console.error(err); res.status(500).json("Error al realizar la consulta"); }
});

app.put("/api/gestores/:id", async function (req, res) {
    var id = Number(req.params.id);
    var datos = req.body || {};
    if (!Number.isInteger(id) || id <= 0) return res.status(400).send("ID inválido");
    // El token de un gestor no debe servir para modificar el perfil de otro.
    if (id !== Number(req.idGestor)) return res.status(403).send("Acceso denegado");
    try {
        var actual = await supabase.from("gestores").select("*").eq("id", id).maybeSingle();
        if (actual.error) throw actual.error;
        if (!actual.data) return res.status(404).send("Gestor no existe");
        if (datos.nombre != null && !esNombreOApellidosValido(datos.nombre)) return res.status(400).send("Nombre inválido");
        if (datos.apellidos != null && !esNombreOApellidosValido(datos.apellidos)) return res.status(400).send("Apellidos inválidos");
        var actualizado = {
            nombre: datos.nombre != null ? datos.nombre.trim() : actual.data.nombre,
            apellidos: datos.apellidos != null ? datos.apellidos.trim() : actual.data.apellidos,
            usuario: datos.usuario != null ? datos.usuario : actual.data.usuario,
            password: datos.password != null ? datos.password : actual.data.password
        };
        var encontrado = await supabase.from("gestores").select("id").eq("usuario", actualizado.usuario).neq("id", id);
        if (encontrado.error) throw encontrado.error;
        if (encontrado.data.length) return res.status(403).send("Usuario ya existe");
        var r = await supabase.from("gestores").update(actualizado).eq("id", id);
        if (r.error) {
            if (r.error.code === "23505") return res.status(403).send("Usuario ya existe");
            throw r.error;
        }
        return res.status(200).send("OK");
    } catch (err) { console.error(err); return res.status(500).json("Error al realizar la consulta"); }
});

app.get("/api/gestores/:id", async function (req, res) {
    var id = Number(req.params.id);
    if (id !== Number(req.idGestor)) return res.status(403).json("Acceso denegado");
    try {
        var r = await supabase.from("gestores").select("id,nombre,apellidos,usuario").eq("id", id).maybeSingle();
        if (r.error) throw r.error;
        if (!r.data) return res.status(404).json("Gestor no existe");
        res.status(200).json(r.data);
    } catch (err) { console.error(err); res.status(500).json("Error al realizar la consulta"); }
});

app.get("/api/sanitarios/:id", async function (req, res) {
    try {
        var r = await supabase.from("sanitarios").select("id,nombre,apellidos,usuario").eq("id", req.params.id).maybeSingle();
        if (r.error) throw r.error;
        if (!r.data) return res.status(404).json("Sanitario no existe");
        res.status(200).json(r.data);
    } catch (err) { console.error(err); res.status(500).json("Error al realizar la consulta"); }
});

app.get("/api/recursos", async function (req, res) {
    try {
        var categoria = req.query.categoria;
        var modelo = req.query.modelo;
        var ubicacion = req.query.ubicacion;
        var estado = req.query.estado;
        var q = supabase.from("recursos").select("*");
        if (modelo != null && modelo !== "") q = q.eq("modelo", modelo);
        if (ubicacion != null && ubicacion !== "") q = q.eq("ubicacion", ubicacion);
        if (estado != null && estado !== "") q = q.eq("estado", estado);
        if (categoria != null && categoria !== "") {
            var mods = await supabase.from("modelos").select("id").eq("categoria", categoria);
            if (mods.error) throw mods.error;
            var ids = mods.data.map(function (m) { return m.id; });
            if (!ids.length) return res.status(200).json([]);
            q = q.in("modelo", ids);
        }
        var r = await q.order("id");
        if (r.error) throw r.error;
        res.status(200).json(r.data);
    } catch (err) { console.error(err); res.status(500).json("Error al realizar la consulta"); }
});

app.get("/api/recursos/:id", async function (req, res) {
    try {
        var r = await supabase.from("recursos").select("*").eq("id", req.params.id).maybeSingle();
        if (r.error) throw r.error;
        if (!r.data) return res.status(404).json("Recurso no existe");
        res.status(200).json(r.data);
    } catch (err) { console.error(err); res.status(500).json("Error al realizar la consulta"); }
});

app.post("/api/recursos", async function (req, res) {
    var n = req.body;
    if (!n) return res.status(400).send("Body requerido");
    if (n.modelo == null || n.ubicacion == null || n.estado == null) return res.status(400).send("Faltan campos");
    if (n.numero_serie == null || !String(n.numero_serie).trim()) return res.status(400).send("numero_serie vacío");
    try {
        var numero = String(n.numero_serie).trim();
        var existe = await supabase.from("recursos").select("id").eq("numero_serie", numero);
        if (existe.error) throw existe.error;
        if (existe.data.length) return res.status(403).send("numero_serie ya existe");
        var r = await supabase.from("recursos").insert({
            modelo: n.modelo, ubicacion: n.ubicacion,
            numero_serie: numero, estado: n.estado
        }).select("*").single();
        if (r.error) throw r.error;
        res.status(201).json(r.data);
    } catch (err) { console.error(err); res.status(500).json("Error al realizar la consulta"); }
});

app.put("/api/recursos/:id", async function (req, res) {
    var id = Number(req.params.id);
    var n = req.body || {};
    try {
        var actual = await supabase.from("recursos").select("*").eq("id", id).maybeSingle();
        if (actual.error) throw actual.error;
        if (!actual.data) return res.status(404).send("Recurso no existe");
        if (n.numero_serie != null && !String(n.numero_serie).trim()) return res.status(400).send("numero_serie vacío");
        var actualizado = {
            modelo: n.modelo != null ? n.modelo : actual.data.modelo,
            ubicacion: n.ubicacion != null ? n.ubicacion : actual.data.ubicacion,
            numero_serie: n.numero_serie != null ? String(n.numero_serie).trim() : actual.data.numero_serie,
            estado: n.estado != null ? n.estado : actual.data.estado
        };
        var existe = await supabase.from("recursos").select("id").eq("numero_serie", actualizado.numero_serie).neq("id", id);
        if (existe.error) throw existe.error;
        if (existe.data.length) return res.status(403).send("numero_serie ya existe");
        var r = await supabase.from("recursos").update(actualizado).eq("id", id).select("*").single();
        if (r.error) throw r.error;
        res.status(200).json(r.data);
    } catch (err) { console.error(err); res.status(500).json("Error al realizar la consulta"); }
});

// Supabase/PostgREST no ofrece transacciones entre múltiples llamadas REST.
// Esta eliminación es equivalente a la secuencia del servidor original, pero no atómica.
app.delete("/api/recursos/:id", async function (req, res) {
    var id = Number(req.params.id);
    try {
        var r = await supabase.from("recursos").select("id").eq("id", id).maybeSingle();
        if (r.error) throw r.error;
        if (!r.data) return res.status(404).send("Recurso no existe");
        var reservas = await supabase.from("reservas").delete().eq("idRecurso", id);
        if (reservas.error) throw reservas.error;
        var resenyas = await supabase.from("resenyas").delete().eq("idRecurso", id);
        if (resenyas.error) throw resenyas.error;
        var borrado = await supabase.from("recursos").delete().eq("id", id);
        if (borrado.error) throw borrado.error;
        res.status(200).send("OK");
    } catch (err) { console.error(err); res.status(500).json("Error al realizar la consulta"); }
});

app.get("/api/recursos/:id/reservas", async function (req, res) {
    var id = Number(req.params.id);
    try {
        var r = await supabase.from("reservas").select("*").eq("idRecurso", id).order("id");
        if (r.error) throw r.error;
        var ids = [...new Set(r.data.map(function (x) { return x.idSanitario; }))];
        var nombres = {};
        if (ids.length) {
            var s = await supabase.from("sanitarios").select("id,nombre,apellidos").in("id", ids);
            if (s.error) throw s.error;
            s.data.forEach(function (x) { nombres[x.id] = x.nombre + " " + x.apellidos; });
        }
        res.status(200).json(r.data.map(function (x) { return Object.assign({}, x, { sanitario: nombres[x.idSanitario] || "" }); }));
    } catch (err) { console.error(err); res.status(500).json("Error al realizar la consulta"); }
});

app.get("/api/recursos/:id/resenyas", async function (req, res) {
    var id = Number(req.params.id);
    try {
        var r = await supabase.from("resenyas").select("*").eq("idRecurso", id).order("id");
        if (r.error) throw r.error;
        var ids = [...new Set(r.data.map(function (x) { return x.idSanitario; }))];
        var nombres = {};
        if (ids.length) {
            var s = await supabase.from("sanitarios").select("id,nombre,apellidos").in("id", ids);
            if (s.error) throw s.error;
            s.data.forEach(function (x) { nombres[x.id] = x.nombre + " " + x.apellidos; });
        }
        res.status(200).json(r.data.map(function (x) { return Object.assign({}, x, { sanitario: nombres[x.idSanitario] || "" }); }));
    } catch (err) { console.error(err); res.status(500).json("Error al realizar la consulta"); }
});

var puerto = Number(process.env.PORT) || 3000;
app.listen(puerto, "0.0.0.0", function () {
    console.log("Servidor REST escuchando en puerto " + puerto);
});
