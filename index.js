const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB setup
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zchez.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// ================= JWT =================
app.post("/jwt", (req, res) => {
  const user = req.body;
  const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: "1h",
  });
  res.send({ token });
});

const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized access DGM-1" });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).send({ message: "Unauthorized access DGM-2" });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "Forbidden" });
    }
    req.user = decoded; // ✅ decoded user info attach
    next();
  });
};

// ================= Run Function =================
async function run() {
  try {
    await client.connect();

    const userCollection = client.db("study_buddy_DB").collection("users");
    const sessionCollection = client
      .db("study_buddy_DB")
      .collection("sessions");
    const materialCollection = client
      .db("study_buddy_DB")
      .collection("materials");

    // ================= Role Verify Middleware =================
    const verifyRole = (role) => {
      return async (req, res, next) => {
        const email = req.user?.email;
        const user = await userCollection.findOne({ email });
        if (user?.role !== role) {
          return res.status(403).send({ message: "Forbidden" });
        }
        next();
      };
    };

    // ================= User APIs =================
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exists", existingUser });
      }

      const newUser = {
        name: user?.name,
        email: user?.email,
        role: user?.role || "student", // default role
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await userCollection.insertOne(newUser);
      res.send(result);
    });

    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get("/users/role/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email });
      res.send(user);
    });

    // Search users by name or email
    app.get(
      "/users/search",
  
      async (req, res) => {
        try {
          const searchText = req.query.query?.trim(); // query parameter থেকে নাও
          let query = {};

          if (searchText) {
            query = {
              $or: [
                { name: { $regex: searchText, $options: "i" } }, // name search
                { email: { $regex: searchText, $options: "i" } }, // email search
              ],
            };
          }
          // যদি searchText খালি থাকে, MongoDB সব document return করবে
          const result = await userCollection.find(query).toArray();
          res.send(result);
        } catch (err) {
          res.status(500).send({ message: "Server error", error: err.message });
        }
      }
    );

    // PATCH /users/:id
    app.patch("/users/:id", async (req, res) => {
      const { role } = req.body;
      const id = req.params.id;
      const result = await userCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role } }
      );
      res.send(result);
    });

    // ================= Session APIs =================
    // Create session (Tutor only)
    app.post("/create-sessions", async (req, res) => {
      const session = req.body;

      const result = await sessionCollection.insertOne(session);
      res.send(result);
    });

    // Get all sessions (Admin can see all)
    app.get("/sessions", async (req, res) => {
      const result = await sessionCollection.find().toArray();
      res.send(result);
    });

    // Get tutor-specific sessions
    app.get("/sessions/tutor/:email", async (req, res) => {
      const email = req.params.email;
      if (req.user.email !== email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      const result = await sessionCollection
        .find({ tutorEmail: email })
        .toArray();
      res.send(result);
    });

    // Update session status (Admin only)
    app.patch(
      "/sessions/:id/status",
      verifyJWT,
      verifyRole("admin"),
      async (req, res) => {
        const id = req.params.id;
        const { status } = req.body; // accept/reject
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: { status, updatedAt: new Date() },
        };
        const result = await sessionCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    // ================= Materials APIs =================
    // Upload material (Tutor only, for approved sessions)
    app.post(
      "/materials",
      verifyJWT,
      verifyRole("teacher"),
      async (req, res) => {
        const material = req.body;
        const result = await materialCollection.insertOne(material);
        res.send(result);
      }
    );

    // Get tutor materials
    app.get(
      "/materials/:email",
      verifyJWT,
      verifyRole("teacher"),
      async (req, res) => {
        const email = req.params.email;
        const result = await materialCollection
          .find({ tutorEmail: email })
          .toArray();
        res.send(result);
      }
    );

    // Delete material
    app.delete(
      "/materials/:id",
      verifyJWT,
      verifyRole("teacher"),
      async (req, res) => {
        const id = req.params.id;
        const result = await materialCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      }
    );

    // Update material
    app.patch(
      "/materials/:id",
      verifyJWT,
      verifyRole("teacher"),
      async (req, res) => {
        const id = req.params.id;
        const updated = req.body;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = { $set: { ...updated, updatedAt: new Date() } };
        const result = await materialCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    // ================= End =================
    await client.db("admin").command({ ping: 1 });
    console.log("✅ MongoDB connected successfully!");
  } finally {
    // keep connection alive
  }
}
run().catch(console.dir);

// Root
app.get("/", (req, res) => {
  res.send("🚀 Study Buddy Server Running");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
