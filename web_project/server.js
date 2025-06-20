const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const path = require("path");
const { brotliCompress } = require("zlib");
const app = express();

const MONGO_URI = "mongodb://localhost:27017/userDB";
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("Connected to userDB successfully"))
    .catch(err => {
        console.error("MongoDB Connection Error (userDB):", err);
        process.exit(1);
    });

const User = mongoose.model("User", new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    aadharNumber: { type: String, required: true },
    studentId: { type: String, required: true },
    university: { type: String, required: true },
    password: { type: String, required: true },
    trips: { type: Array, default: [] }
}));

const FLIGHTS_MONGO_URI = "mongodb://localhost:27017/flightsDB";
const flightsConnection = mongoose.createConnection(FLIGHTS_MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

flightsConnection.on("connected", () => {
    console.log("Connected to flightsDB successfully");
});

flightsConnection.on("error", (err) => {
    console.error("MongoDB Connection Error (flightsDB):", err);
    process.exit(1);
});

const Flight = flightsConnection.model("Flight", new mongoose.Schema({
    airline: String,
    flightNumber: String,
    departure: String,
    destination: String,
    price: Number,
    date: String
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "signIN.html")));
app.get("/login.html", (req, res) => res.sendFile(path.join(__dirname, "login.html")));
app.get("/main.html", (req, res) => res.sendFile(path.join(__dirname, "main.html")));
app.get("/yourTrips.html", (req, res) => res.sendFile(path.join(__dirname, "yourTrips.html")));
app.get("/search.html", (req, res) => res.sendFile(path.join(__dirname, "search.html")));

const airports = [
    "Delhi (DEL)",
    "Mumbai (BOM)",
    "Bangalore (BLR)",
    "Chennai (MAA)",
    "Hyderabad (HYD)",
    "Kolkata (CCU)",
    "Pune (PNQ)",
    "Goa (GOI)",
    "Ahmedabad (AMD)",
    "Jaipur (JAI)",
    "Lucknow (LKO)",
    "Chandigarh (IXC)"
];


app.get("/airports", (req, res) => {
    try {
        const query = req.query.q?.toLowerCase();
        if (!query || query.trim().length === 0) {
            return res.json([]); 
        }

        const filteredAirports = airports.filter(airport =>
            airport.toLowerCase().includes(query)
        );

        res.json(filteredAirports); 
    } catch (error) {
        console.error("Error in /airports endpoint:", error);
        res.status(500).json({ message: "Error fetching airport suggestions" });
    }
});



app.post("/signup", async (req, res) => {
    try {
        const { name, email, phone, aadharNumber, studentId, university, password } = req.body;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "Email already registered. Try logging in instead." });
        }

        const user = new User({ name, email, phone, aadharNumber, studentId, university, password });
        await user.save();
        res.status(201).json({ message: "User registered successfully!" });
    } catch (error) {
        console.error("Error saving user:", error);
        res.status(500).json({ message: "Error registering user", error });
    }
});


app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email, password });
        if (!user) {
            return res.status(400).json({ message: "Invalid email or password." });
        }

        res.status(200).json({ redirect: "/main.html" });
    } catch (error) {
        console.error("Error during login:", error);
        res.status(500).json({ message: "Internal server error", error });
    }
});

app.get("/flights", async (req, res) => {
    try {
        const { from, to, date } = req.query;
        if (!from || !to || !date) {
            return res.status(400).json({ message: "Invalid search parameters" });
        }

        const flights = await Flight.find({
            departure: { $regex: `^${from}`, $options: "i" },
            destination: { $regex: `^${to}`, $options: "i" },
            date: date
        });

        res.json(flights);
    } catch (error) {
        console.error("Error fetching flights:", error);
        res.status(500).json({ message: "Error fetching flights" });
    }
});

app.post("/book", async (req, res) => {
    try {
        const { flightId, airline, flightNumber, from, to, date, price, userEmail } = req.body;

        if (!flightId || !airline || !flightNumber || !from || !to || !date || !price || !userEmail) {
            return res.status(400).json({ message: "Missing required booking details" });
        }

        const user = await User.findOne({ email: userEmail });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const booking = { flightId, airline, flightNumber, from, to, date, price };
        user.trips.push(booking);

        await user.save();

        res.status(200).json({ message: "Flight booked successfully!" });
    } catch (error) {
        console.error("Error processing booking:", error);
        res.status(500).json({ message: "Error processing booking" });
    }
});

app.post("/cancel-booking", async (req, res) => {
    try {
        const { userEmail, flightId } = req.body;

        if (!userEmail || !flightId) {
            return res.status(400).json({ message: "Missing required cancellation details" });
        }

        const user = await User.findOne({ email: userEmail });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const tripIndex = user.trips.findIndex(trip => trip.flightId === flightId);
        if (tripIndex === -1) {
            return res.status(404).json({ message: "Booking not found" });
        }

        user.trips.splice(tripIndex, 1);

        await user.save();

        res.status(200).json({ message: "Booking canceled successfully!" });
    } catch (error) {
        console.error("Error canceling booking:", error);
        res.status(500).json({ message: "Error canceling booking" });
    }
});

app.get("/my-trips", async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json(user.trips);
    } catch (error) {
        console.error("Error fetching trips:", error);
        res.status(500).json({ message: "Error fetching trips" });
    }
});


app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(express.static(path.join(__dirname)));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
