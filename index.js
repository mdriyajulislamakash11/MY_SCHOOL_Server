const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config(); // Load .env variables
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion } = require("mongodb");

// Middleware
app.use(cors());
app.use(express.json());

// mongo setup

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zchez.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const userCollection = client.db("study_buddy_DB").collection("users");
    const sessionCollection = client.db("study_buddy_DB").collection("sessions");


    // JWT Related APIs ______________________________________________//
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // Verify JWT Middleware
    const verifyJWT = (req, res, next) => {
      if (!req.headers.authentication) {
        return res.status(401).send({ message: "unauthorized Access DGM-1" });
      }

      const token = req.headers.authorization?.split(" ")[1];
      if (!token) {
        return res.status(401).send({ message: "Unauthorized access" });
      }
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(403).send({ message: "Forbidden" });
        }
        req.user = decoded;
        next();
      });
    };

    // verify Student Middleware
    const verifyStudent = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (user?.role !== "student") {
        return res.status(403).send({ message: "Forbidden" });
      }
      next();
    };  

    // verify teacher Middleware
    const verifyTeacher = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (user?.role !== "teacher") {
        return res.status(403).send({ message: "Forbidden" });
      }
      next();
    };

    // verify Admin Middleware
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (user?.role !== "admin") {
        return res.status(403).send({ message: "Forbidden" });
      }
      next();
    };

    // _________________________________ end of JWT Related APIs //_____________________________//




    // user related apis ______________________________________________//
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
        role: user?.role || "student", // Default role is 'student'
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await userCollection.insertOne(newUser);
      res.send(result);
    });

    // ✅ Get All Users (GET)
    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // ✅ Get Single User by Email (GET)
    app.get("/users/role/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email });
      res.send(user);
    });

    //teacher related apis ______________________________________________//
    app.post("/create-sessions", async (req, res) => {
      const session = req.body; 
      
      // Create a new session
      const result = await sessionCollection.insertOne(session);
      res.send(result);
    });









    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// Root route
app.get("/", (req, res) => {
  res.send("Server is running");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
