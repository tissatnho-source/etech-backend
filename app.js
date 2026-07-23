const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const app = express();

// ==========================================
// Middleware செட்டப்
// ==========================================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// EJS வியூ என்ஜின் (View Engine) செட்டப்
app.set('view engine', 'ejs');

// செஷன் (Session) செட்டப்
app.use(session({
    secret: 'etech-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// ==========================================
// MongoDB இணைப்பு (சரியான URL உடன்)
// ==========================================
const MONGO_URI = 'mongodb+srv://etechadmin:Admin123456@cluster0.gwjchih.mongodb.net/etech?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log("✅ MongoDB connected successfully.");
    })
    .catch((err) => {
        console.error("❌ MongoDB connection error:", err);
    });

// Partner Schema
const PartnerSchema = new mongoose.Schema({
    mobile: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const Partner = mongoose.models.Partner || mongoose.model('Partner', PartnerSchema);

// ==========================================
// ரூட்கள் (Routes)
// ==========================================

// 1. ஹோம் பேஜ் -> லாகினுக்கு ரெடீரெக்ட் செய்ய
app.get('/partner/login', (req, res) => {
    res.render('partner_login', { error: null }); // 👈 error-ஐ null ஆக அனுப்புதல்
});
// 3. பார்ட்னர் / அட்மின் லாகின் (POST)
app.post('/partner/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).render('partner_login', { error: 'தயவுசெய்து மொபைல் எண் மற்றும் பாஸ்வேர்டை உள்ளிடவும்' });
        }

        // 👑 அட்மின் லாகின் சோதனை (manimaran / 123)
        if (username.trim() === 'manimaran' && password === '123') {
            if (req.session) {
                req.session.adminLoggedIn = true;
                req.session.adminName = 'Manimaran';
            }
            console.log("Admin login success.");
            return res.redirect('/admin/dashboard');
        }

        // 📄 டேட்டாபேஸில் பார்ட்னரைத் தேடுதல்
        const partner = await Partner.findOne({ mobile: username.trim() });
        if (!partner) {
            console.log(`Login failed: Mobile ${username} not found.`);
            return res.status(400).render('partner_login', { error: 'தவறான மொபைல் எண் அல்லது பாஸ்வேர்ட்' });
        }

        if (partner.password !== password) {
            return res.status(400).render('partner_login', { error: 'தவறான பாஸ்வேர்ட்' });
        }

        req.session.partnerLoggedIn = true;
        req.session.partnerId = partner._id;
        res.redirect('/partner/dashboard');

    } catch (error) {
        console.error("Error in partner login:", error);
        res.status(500).send("Internal Server Error");
    }
});

// 4. அட்மின் டேஷ்போர்ட்
app.get('/admin/dashboard', (req, res) => {
    if (!req.session || !req.session.adminLoggedIn) {
        return res.redirect('/partner/login');
    }
    res.render('dashboard');
});

// 5. பார்ட்னர் லாக்-அவுட் ரூட் (GET)
app.get('/partner/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/partner/login');
    });
});

// ==========================================
// பார்ட்னர் லிஸ்ட் பக்கம் (GET)
// ==========================================
app.get('/partner-list', async (req, res) => {
    try {
        if (!req.session || !req.session.adminLoggedIn) {
            return res.redirect('/partner/login');
        }

        const partners = await Partner.find({});
        res.render('partner_list', { partners: partners });

    } catch (error) {
        console.error("Partner List Error:", error);
        res.status(500).send("Detailed Error: " + error.message);
    }
});

// ==========================================
// 2. பார்ட்னர் லாகின் பக்கம் (GET)
// ==========================================
app.get('/partner/login', (req, res) => {
    res.render('partner_login'); // views ஃபோல்டருக்குள் partner_login.ejs இருக்க வேண்டும்
});
// ==========================================
// சர்வர் போர்ட் தொடக்கம்
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`ETECH Live on Port ${PORT}`);
});
