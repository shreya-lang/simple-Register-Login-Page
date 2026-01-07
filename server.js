require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const mongoose = require("mongoose");
const path = require("path");
const bcrypt = require("bcryptjs");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB Connection (LOCAL DB)
mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/student-course-registration");

const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));
db.once("open", function () {
    console.log("MongoDB connected successfully!");
});

// Define schemas and models
const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    password: { type: String, required: true },
    registeredCourses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }]
});

const courseSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    credits: { type: Number, required: true },
    instructor: { type: String, required: true },
    schedule: { type: String, required: true },
    capacity: { type: Number, required: true },
    enrolled: { type: Number, default: 0 }
});

const User = mongoose.model("User", userSchema);
const Course = mongoose.model("Course", courseSchema);

// Middleware
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(session({
    secret: "super-safe-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Seed initial courses (run once)
async function seedCourses() {
    const count = await Course.countDocuments();
    if (count === 0) {
        await Course.insertMany([
            { code: "CS101", title: "Intro to CS", description: "Basics", credits: 3, instructor: "Dr. Smith", schedule: "Mon/Wed 10:00", capacity: 50 },
            { code: "MATH201", title: "Calculus I", description: "Math", credits: 4, instructor: "Prof. John", schedule: "Tue/Thu 1:00", capacity: 40 }
        ]);
        console.log("Courses seeded!");
    }
}

// Routes
app.get("/", (req, res) => res.redirect("/login"));

app.get("/register", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "register.html"));
});

app.post("/register", async (req, res) => {
    const { username, email, phone, password, confirmPassword } = req.body;
    if (password !== confirmPassword) return res.status(400).json({ error: "Passwords do not match" });

    try {
        const hashed = await bcrypt.hash(password, 10);
        await new User({ username, email, phone, password: hashed }).save();
        res.json({ message: "Registered!" });
    } catch (e) {
        res.status(500).json({ error: "Registration failed" });
    }
});

app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "login.html"));
});

app.post("/login", async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: "Invalid credentials" });

        req.session.user = { id: user._id, username: user.username, email: user.email };
        res.json({ message: "Logged in!" });
    } catch {
        res.status(500).json({ error: "Login failed" });
    }
});

app.get("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/login"));
});

app.get("/api/courses", async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
    res.json(await Course.find());
});

app.post("/api/courses/register", async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
    const { courseId } = req.body;

    try {
        const course = await Course.findById(courseId);
        const user = await User.findById(req.session.user.id);

        if (!course) return res.status(404).json({ error: "Course not found" });
        if (course.enrolled >= course.capacity) return res.status(400).json({ error: "Course full" });

        course.enrolled++;
        user.registeredCourses.push(courseId);

        await course.save();
        await user.save();
        res.json({ message: "Course Registered!" });
    } catch {
        res.status(500).json({ error: "Failed to register course" });
    }
});

app.get("/home", (req, res) => {
    if (!req.session.user) return res.redirect("/login");
    res.sendFile(path.join(__dirname, "views", "home.html"));
});

app.listen(PORT, async () => {
    console.log(`Server running at http://localhost:${PORT}`);
    await seedCourses();
});
