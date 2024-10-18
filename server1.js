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
const rateLimit = require('express-rate-limit');
const csvParser = require('csv-parser');

// Load environment variables
dotenv.config();
const MONGO_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// Initialize app
const app = express();

// MongoDB connection
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
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

// Create Models
const Student = mongoose.model('Student', StudentSchema);
const User = mongoose.model('User', UserSchema);


//placements
// Define Schemas
const placementSchema = new mongoose.Schema({
    collegeName: { type: String, required: true },
    year: { type: Number, required: true },
    data: { type: Array, required: true }, // To store CSV data
});

const Placement = mongoose.model('Placement', placementSchema);


const collegeAdminSchema = new mongoose.Schema({
  email: { type: String, required: true },
  location: { type: String, required: true },
  pincode: { type: String, required: true },
  universityAffiliation: { type: String, required: true },
  naacCertPhoto: { type: String, required: true },
  website: { type: String, required: true },
  noOfBranches: { type: Number, required: true },
  branches: { type: [String], required: true }
});

const CollegeAdmin = mongoose.model('CollegeAdmin', collegeAdminSchema);

const approvedCollegeAdminSchema = new mongoose.Schema({
  email: { type: String, required: true },
  location: { type: String, required: true },
  pincode: { type: String, required: true },
  universityAffiliation: { type: String, required: true },
  naacCertPhoto: { type: String, required: true },
  website: { type: String, required: true },
  noOfBranches: { type: Number, required: true },
  branches: { type: [String], required: true }
});

const ApprovedCollegeAdmin = mongoose.model('ApprovedCollegeAdmin', approvedCollegeAdminSchema);


// Middleware
app.use(cors()); // Enable CORS
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Rate Limiting Middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per window
  message: 'Too many requests from this IP, please try again later.',
});
app.use(limiter);

// Multer Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5 MB limit

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// User Registration
app.post('/api/register', async (req, res) => {
  const { name, email, password, userType } = req.body;

  if (!name || !email || !password || !userType) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  try {
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) return res.status(400).json({ message: 'Email already in use.' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ name, email: email.toLowerCase(), password: hashedPassword, userType });
    await newUser.save();
    res.status(201).json({ message: 'User registered successfully.' });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// User Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });

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
      email, location, pinCode, marks10, is12thCompleted, marks12, parents,
      interests, hobbies, fieldOfInterest,
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
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const student = await Student.findOne({ email });
    if (!student) return res.status(404).json({ message: 'Student not found' });

    res.status(200).json(student);
  } catch (error) {
    console.error('Error retrieving student:', error);
    res.status(500).json({ message: 'Failed to retrieve student', error: error.message });
  }
});

//Placement data in csv 







app.post('/collegeAdminData', async (req, res) => {
    const { email, location, pincode, universityAffiliation, naacCertPhoto, website, noOfBranches, branches } = req.body;

    try {
        if (!email || !location || !pincode || !universityAffiliation || !naacCertPhoto || !website || !noOfBranches || !branches) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const newCollegeAdmin = new CollegeAdmin({ email, location, pincode, universityAffiliation, naacCertPhoto, website, noOfBranches, branches });
        await newCollegeAdmin.save();
        res.status(201).send({ status: "ok", message: "College Admin data saved successfully" });
    } catch (error) {
        res.status(500).send({ error: "Error saving College Admin data" });
    }
});

app.get('/api/students/recommendationInfo', async (req, res) => {
  try {
    const { email } = req.query;

    // Check if email is provided
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Fetch student data by email and only retrieve the necessary fields
    const student = await Student.findOne({ email }, 'email location parents.fatherSalary parents.motherSalary');

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Send the necessary information in the response
    res.status(200).json({
      email: student.email,
      location: student.location,
      fatherSalary: student.parents.fatherSalary,
      motherSalary: student.parents.motherSalary,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching student data', error: error.message });
  }
});
//college data for recomendation
app.post('/colleges', async (req, res) => {
  const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    await client.connect();
    const db = client.db(EduGuide);
    const collection = db.collection(CollegeData);

    // Insert the college data into the collection
    const result = await collection.insertOne(req.body);

    res.status(201).json({
      message: 'College data added successfully',
      collegeId: result.insertedId,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to add college data' });
  } finally {
    client.close();
  }
});

const placementDataSchema = new mongoose.Schema({
  collegeName: {
      type: String,
      required: true,
  },
  year: {
      type: Number,
      required: true,
  },
  fileUrl: {
      type: String,
      required: true,
  },
  fileName: {
      type: String,
      required: true,
  },
  mimeType: {
      type: String,
      required: true,
  },
  approved: {
      type: Boolean,
      default: false,
  },
});

const PlacementData = mongoose.model('PlacementData', placementDataSchema);

// Configure multer for file upload
const storage1 = multer.diskStorage({
  destination: function (req, file, cb) {
      cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
      cb(null, file.originalname);
  }
});

const upload1 = multer({ storage: storage1 }); // Correct usage of storage1

// API route for file and data upload
app.post('/api/upload', upload1.single('file'), async (req, res) => {
  try {
      const { collegeName, year } = req.body;

      // Check if required fields are present
      if (!collegeName || !year || !req.file) {
          return res.status(400).json({ message: 'Missing required fields' });
      }

      // Create a new PlacementData entry
      const newData = new PlacementData({
          collegeName,
          year: parseInt(year),
          fileUrl: `uploads/${req.file.originalname}`,
          fileName: req.file.originalname,
          mimeType: req.file.mimetype,
      });

      // Save the data in MongoDB
      await newData.save();

      // Send success response
      res.status(201).json({ message: 'Data uploaded successfully' });
  } catch (error) {
      console.error('Error saving data:', error);
      res.status(500).json({ message: 'Server error' });
  }
});

// API route to get placement data
app.get('/api/get-placement-data', async (req, res) => {
  try {
      const placementRecords = await PlacementData.find({ approved: false });

      let allPlacementData = [];

      for (const record of placementRecords) {
          const filePath = path.join(__dirname, record.fileUrl);

          // Check if the file exists
          if (!fs.existsSync(filePath)) {
              console.error(`File not found: ${filePath}`);
              continue;
          }

          const csvData = await parseCsvFile(filePath);
          allPlacementData.push({
              _id: record._id,
              collegeName: record.collegeName,
              year: record.year,
              data: csvData
          });
      }

      res.status(200).json(allPlacementData);
  } catch (error) {
      console.error('Error fetching placement data:', error);
      res.status(500).json({ message: 'Failed to fetch placement data' });
  }
});

// API route to approve placement
app.post('/api/approve-placement/:id', async (req, res) => {
  const placementId = req.params.id;
  console.log(`Received request to approve placement with ID: ${placementId}`);

  try {
      if (!placementId) {
          return res.status(400).json({ message: 'Placement ID is required' });
      }

      const updatedPlacement = await PlacementData.findByIdAndUpdate(
          placementId, 
          { approved: true }, 
          { new: true } 
      );

      if (!updatedPlacement) {
          return res.status(404).json({ message: 'Placement not found' });
      }

      res.status(200).json({ message: 'Placement approved successfully', updatedPlacement });
  } catch (error) {
      console.error('Error approving placement:', error);
      res.status(500).json({ message: 'Failed to approve placement' });
  }
});

// API route to reject placement
app.delete('/api/reject-placement/:id', async (req, res) => {
  const placementId = req.params.id;
  console.log(`Received request to reject placement with ID: ${placementId}`);

  try {
      if (!placementId) {
          return res.status(400).json({ message: 'Placement ID is required' });
      }

      const deletedPlacement = await PlacementData.findByIdAndDelete(placementId);

      if (!deletedPlacement) {
          return res.status(404).json({ message: 'Placement not found' });
      }

      res.status(200).json({ message: 'Placement rejected successfully' });
  } catch (error) {
      console.error('Error rejecting placement:', error);
      res.status(500).json({ message: 'Failed to reject placement' });
  }
});

// API route to get approved placement data by college name and year
app.get('/api/get-approved-placement-data', async (req, res) => {
  const { collegeName, year } = req.query;

  try {
      if (!collegeName || !year) {
          return res.status(400).json({ message: 'College name and year are required' });
      }

      const placementRecords = await PlacementData.find({
          collegeName,
          year: parseInt(year),
          approved: true
      });

      if (placementRecords.length === 0) {
          return res.status(404).json({ message: 'No approved placements found for the specified college and year' });
      }

      let allCsvData = [];

      for (const record of placementRecords) {
          const filePath = path.join(__dirname, record.fileUrl);

          if (fs.existsSync(filePath)) {
              const csvData = await parseCsvFile(filePath);
              allCsvData.push({
                  collegeName: record.collegeName,
                  year: record.year,
                  data: csvData
              });
          } else {
              console.error(`File not found: ${filePath}`);
          }
      }

      res.status(200).json(allCsvData);
  } catch (error) {
      console.error('Error fetching approved placement data:', error);
      res.status(500).json({ message: 'Failed to fetch approved placement data' });
  }
});

// Endpoint to serve the CSV file
app.get('/uploads/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'uploads', req.params.filename);
  res.sendFile(filePath, (err) => {
      if (err) {
          console.error(`Failed to send file: ${filePath}`, err);
          res.status(err.status).end();
      }
  });
});

// Helper function to parse CSV file
function parseCsvFile(filePath) {
  return new Promise((resolve, reject) => {
      const results = [];

      fs.createReadStream(filePath)
          .pipe(csvParser())
          .on('data', (data) => results.push(data))
          .on('end', () => resolve(results))
          .on('error', (error) => reject(error));
  });
}

app.get('/collegeAdmins', async (req, res) => {
    try {
        const collegeAdmins = await CollegeAdmin.find();
        res.json(collegeAdmins);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch college admins' });
    }
});

app.post('/approveCollegeAdmin', async (req, res) => {
    try {
        const admin = req.body;

        await ApprovedCollegeAdmin.create(admin);
        await CollegeAdmin.findByIdAndDelete(admin._id);

        res.status(200).send('College Admin approved');
    } catch (error) {
        res.status(500).send('Failed to approve college admin');
    }
});

app.post('/disapproveCollegeAdmin', async (req, res) => {
    try {
        const { id } = req.body;
        await CollegeAdmin.findByIdAndDelete(id);
        res.status(200).send('College Admin disapproved');
    } catch (error) {
        res.status(500).send('Failed to disapprove college admin');
    }
});


// Transaction schema
const transactionSchema = new mongoose.Schema({
  email: String,
  orderId: String,
  amount: Number,
  status: { type: String, default: 'pending' }, // Updated to include status
  timestamp: { type: Date, default: Date.now }
});

const Transaction = mongoose.model('Transaction', transactionSchema);

// Routes //new code
app.get('/students', async (req, res) => {
  try {
    const students = await Student.find();
    res.json(students);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/transactions', async (req, res) => {
  const { email, orderId, amount } = req.body;

  const transaction = new Transaction({
    email,
    orderId,
    amount
  });

  try {
    const savedTransaction = await transaction.save();
    res.status(201).json(savedTransaction);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Endpoint to update payment status
app.post('/payment-status', async (req, res) => {
  const { orderId, status } = req.body;

  try {
    const transaction = await Transaction.findOneAndUpdate(
      { orderId },
      { status },
      { new: true, upsert: true }
    );
    res.status(200).json(transaction);
  } catch (error) {
    res.status(500).json({ error: 'Error updating payment status' });
  }
});


// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
