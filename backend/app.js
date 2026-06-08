const express = require('express');
const cors = require('cors');
const path = require('path');


const authRoutes = require('./routes/authroutes');
const paymentRoutes = require('./routes/paymentroutes');
const cardsRoutes = require('./routes/cardsroutes');
const subscriptionRoutes = require('./routes/subscriptionroutes');
const projectRoutes = require('./routes/projectroutes');
const submissionRoutes = require('./routes/submissionroutes');
const teamRoutes = require('./routes/teamroutes');
const dashboardRoutes = require('./routes/dashboardroutes');
const internalRoutes = require('./routes/internalroutes');



const app = express();

// Trust the first proxy hop (required on Vercel/any reverse proxy for rate limiting to work correctly)
app.set('trust proxy', 1);

app.use(cors({
  origin: [
    'http://localhost:4200',
    'https://www.docsndocs.com',
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-email', 'x-user-otp', 'x-verify-context'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api', authRoutes);
app.use('/api', internalRoutes);
app.use('/api', paymentRoutes);
app.use('/api', cardsRoutes);
app.use('/api', subscriptionRoutes);
app.use('/api', projectRoutes);
app.use('/api', submissionRoutes);
app.use('/api', teamRoutes);
app.use('/api', dashboardRoutes);
app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.send('🚀 Welcome to my Node API!');
});

app.use((req, res) => {
  console.warn(`404 Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ message: `Route ${req.originalUrl} not found` });
});

module.exports = app;
