require("dotenv").config();
const express = require("express");
const cors = require("cors");

const { authRoutes } = require("./routes/auth.routes");
const { productsRoutes } = require("./routes/products.routes");
const { comandasRoutes } = require("./routes/comandas.routes");

const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

app.get("/", (req, res) => res.send("API rodando ✅ use /health"));
app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/auth", authRoutes);
app.use("/products", productsRoutes);
app.use("/comandas", comandasRoutes);

const port = Number(process.env.PORT || 3333);
app.listen(port, () => console.log(`API on http://localhost:${port}`));