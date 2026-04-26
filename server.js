require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
}));
app.use(cookieParser());
app.use(helmet());
app.use(morgan('dev'));

const seedPermissions = require('./utils/seeder');

// Database Connection
mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('MongoDB Connected');
        await seedPermissions();
    })
    .catch(err => console.error('MongoDB Connection Error:', err));

// Routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const pfRoutes = require('./routes/pfRoutes');
const payrollRoutes = require('./routes/payrollRoutes');
const pfActionsRoutes = require('./routes/pfActionsRoutes');
const reportRoutes = require('./routes/reportRoutes');
const pfTaxRoutes = require('./routes/pfTaxRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/pf', pfRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/actions', pfActionsRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/pf-tax', pfTaxRoutes);

app.get('/', (req, res) => {
    res.send('API is running...');
});

// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Internal Server Error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
