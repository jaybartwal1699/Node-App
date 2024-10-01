const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const PDFParser = require('pdf2json');
const path = require('path');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit'); // Importing express-rate-limit

// Load environment variables from .env file
dotenv.config();
const MONGO_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

const app = express();

// MongoDB connection
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB connected'))
  .catch(error => {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  });

// Define Schemas
const StudentSchema = new mongoose.Schema({
  email: { type: String, required: true },
  location: String,
  pinCode: String,
  marks10: {
    math: String,
    english: String,
    science: String,
  },
  is12thCompleted: { type: Boolean, default: false },
  marks12: {
    biology: String,
    math: String,
    physics: String,
    chemistry: String,
  },
  parents: {
    fatherName: String,
    motherName: String,
    fatherOccupation: String,
    motherOccupation: String,
    fatherSalary: String,
    motherSalary: String,
  },
  interests: String,
  hobbies: String,
  fieldOfInterest: String,
  photo: String,
  markSheet: String,
});

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  userType: { type: String, enum: ['admin', 'student'], required: true },
  createdAt: { type: Date, default: Date.now },
});

const PlacementSchema = new mongoose.Schema({
    year: Number,
    collegeName: String,
    collegeEmail: String,
    numberOfCompanies: Number,
    departments: [
        {
            departmentName: String,
            companies: [
                {
                    companyName: String,
                    avgPackage: Number,
                    status: String,
                    totalPlaced: Number
                }
            ]
        }
    ]
});

const CollegeAdminSchema = new mongoose.Schema({
  email: { type: String, required: true },
  location: { type: String, required: true },
  pincode: { type: String, required: true },
  universityAffiliation: { type: String, required: true },
  naacCertPhoto: { type: String, required: true },
  website: { type: String, required: true },
  noOfBranches: { type: Number, required: true },
  branches: { type: [String], required: true }
});

// Create Models
const Student = mongoose.model('Student', StudentSchema);
const User = mongoose.model('User', UserSchema);
const Placement = mongoose.model('Placement', PlacementSchema);
const CollegeAdmin = mongoose.model('CollegeAdmin', CollegeAdminSchema);

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Rate Limiting Middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});

// Apply to all requests
app.use(limiter);

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB file size limit
});

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes

// Register User
app.post('/api/register', async (req, res) => {
  const { name, email, password, userType } = req.body;

  if (!name || !email || !password || !userType) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  try {
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already in use.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ name, email: email.toLowerCase(), password: hashedPassword, userType });
    await newUser.save();
    res.status(201).json({ message: 'User registered successfully.' });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// Login Route
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ message: 'Invalid credentials.' });
    }

    const token = jwt.sign({ id: user._id, userType: user.userType }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, userType: user.userType, name: user.name });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// Submit Student Details
app.post('/api/students/submitDetails', upload.fields([{ name: 'photo' }, { name: 'markSheet' }]), async (req, res) => {
  try {
    const {
      email,
      location,
      pinCode,
      marks10,
      is12thCompleted,
      marks12,
      parents,
      interests,
      hobbies,
      fieldOfInterest,
    } = req.body;

    const photo = req.files.photo ? `/uploads/${req.files.photo[0].filename}` : null;
    const markSheet = req.files.markSheet ? `/uploads/${req.files.markSheet[0].filename}` : null;

    const newStudent = new Student({
      email,
      location,
      pinCode,
      marks10: JSON.parse(marks10),
      is12thCompleted: JSON.parse(is12thCompleted),
      marks12: JSON.parse(marks12),
      parents: JSON.parse(parents),
      interests,
      hobbies,
      fieldOfInterest,
      photo,
      markSheet,
    });

    await newStudent.save();
    res.status(201).json({ message: 'Student details saved successfully' });
  } catch (error) {
    console.error('Error saving student details:', error);
    res.status(500).json({ message: 'Failed to save student details' });
  }
});

// Fetch Student by Email
app.get('/api/students/byEmail', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const student = await Student.findOne({ email });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.status(200).json(student);
  } catch (error) {
    res.status(500).json({ message: 'Failed to retrieve student', error: error.message });
  }
});

// Upload Placement Data
app.post('/upload-placement', upload.single('placementFile'), async (req, res) => {
  try {
    const { collegeName, year } = req.body;
    const file = req.file;

    if (!collegeName || !year || !file) {
      return res.status(400).json({ message: 'College name, year, and file are required.' });
    }

    const placementData = new Placement({
      collegeName,
      year,
      filePath: file.path,
    });

    await placementData.save();

    // Parse PDF
    const pdfParser = new PDFParser();
    pdfParser.loadPDF(file.path);
    pdfParser.on('pdfParser_dataError', errData => console.error(errData.parserError));
    pdfParser.on('pdfParser_dataReady', async pdfData => {
      // Handle your PDF data
      console.log('Parsed PDF Data:', pdfData);
    });

    res.status(201).json({ message: 'Placement data uploaded successfully.' });
  } catch (error) {
    console.error('Error uploading placement data:', error);
    res.status(500).json({ message: 'Failed to upload placement data.' });
  }
});

app.get('/api/getApprovedPlacementData', async (req, res) => {
  try {
      const placements = await Placement.find(); // Fetch all approved placement data
      res.json(placements);
  } catch (error) {
      console.error('Error fetching placement data:', error);
      res.status(500).json({ message: 'Error fetching placement data' });
  }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
