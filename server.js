const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(session({
    secret: 'etech_master_unified_secure_key_2026',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// MongoDB Connection with Fallback
let isMongoConnected = false;
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ecash_db', {
    serverSelectionTimeoutMS: 5000
})
.then(() => {
    console.log('✅ MongoDB connected successfully.');
    isMongoConnected = true;
    setupDefaultAdmin();
})
.catch(err => {
    console.log('⚠️ Running on Local Fallback Mode (Database unavailable)');
    isMongoConnected = false;
});

// User Schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    company: { type: String },
    mobile: { type: String },
    email: { type: String },
    code: { type: String },
    role: { type: String, enum: ['ADMIN', 'PARTNER', 'VENDOR'], required: true },
    balance: { type: Number, default: 0 },
    status: { type: String, default: 'active' },
    areas: { type: [String], default: [] }
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', userSchema);

// Cash Request Schema
const cashRequestSchema = new mongoose.Schema({
    username: String,
    amount: Number,
    type: String,
    status: { type: String, default: 'Pending' }
});
const CashRequest = mongoose.models.CashRequest || mongoose.model('CashRequest', cashRequestSchema);

// Setup default Admin (Only creates if not exists)
async function setupDefaultAdmin() {
    try {
        if (!isMongoConnected) return;
        const adminExists = await User.findOne({ username: 'manimaran' });
        if (!adminExists) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('123', salt);
            
            const newAdmin = new User({
                username: 'manimaran',
                password: hashedPassword, // Encrypted default password
                name: 'Manimaran Admin',
                role: 'ADMIN',
                balance: 100000.00,
                status: 'active'
            });
            await newAdmin.save();
            console.log("ℹ️ Default Admin Synced!");
        }
    } catch(err) {
        console.error(err.message);
    }
}

// Routes
// --- Routes ---

app.get('/', async (req, res) => {
    try {
        let user = null;
        if (req.session && req.session.userId) {
            user = await User.findById(req.session.userId);
        }
        res.render('index', { user: user });
    } catch (err) {
        res.render('index', { user: null });
    }
});

app.get('/home', async (req, res) => {
    try {
        let user = null;
        if (req.session && req.session.userId) {
            user = await User.findById(req.session.userId);
        }
        res.render('index', { user: user });
    } catch (err) {
        res.render('index', { user: null });
    }
});

// லாகின் பக்கத்திற்கான ரவுட் (இது விடுபட்டதால் தான் பிழை வந்தது)
app.get('/partner/login', (req, res) => {
    res.render('partner_login', { error: null });
});

// --- List Routes ---
app.get('/partner-list', async (req, res) => {
    if (!req.session.loggedIn || req.session.role !== 'ADMIN') return res.redirect('/partner/login');
    const partners = await User.find({ role: 'PARTNER' });
    res.render('partner_list', { partners: partners });
});
// Dynamic Login Gateway (Fully driven by Database with Local Fallback only if Mongo is down)
app.post('/partner/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.render('partner_login', { error: 'Username and Password are required!' });
        }

        const trimmedUser = username.trim();
        const trimmedPass = password.toString().trim();

        if (isMongoConnected) {
            const user = await User.findOne({ username: trimmedUser });
            if (user) {
                if (user.status.toLowerCase() !== 'active') {
                    return res.render('partner_login', { error: 'Your account is deactivated!' });
                }

                let isMatch = false;
                if (user.password.startsWith('$2b$') || user.password.startsWith('$2a$')) {
                    const bcrypt = require('bcrypt');
                    isMatch = await bcrypt.compare(trimmedPass, user.password);
                } else {
                    isMatch = (trimmedPass === user.password);
                }

                if (isMatch) {
                    req.session.loggedIn = true;
                    req.session.userId = user._id;
                    req.session.username = user.username;
                    req.session.name = user.name;
                    req.session.role = user.role;
                    return res.redirect('/home');
                }
            }
        } else {
            // EMERGENCY LOCAL BYPASS
            if (trimmedUser === 'manimaran' && trimmedPass === '123') {
                req.session.loggedIn = true;
                req.session.userId = 'admin_local_id_999';
                req.session.username = 'manimaran';
                req.session.name = 'Manimaran Admin';
                req.session.role = 'ADMIN';
                return res.redirect('/home');
            }
        }

        return res.render('partner_login', { error: 'Invalid Username or Password!' });
    } catch (error) {
        console.error("Login Error:", error);
        return res.render('partner_login', { error: 'System technical error occurred!' });
    }
});
app.post('/admin/partner/add', async (req, res) => {
    try {
        const bcrypt = require('bcrypt');
        // புதிய ஃபீல்டுகளை இங்கே சேர்க்கவும்
        const { firstName, lastName, mobile, email, address1, address2, state, district, pincode, partnerCode, referralCode, username, password, functionalArea } = req.body;

        const hashedPassword = await bcrypt.hash(password, 10);

        const newPartner = new User({
            name: `${firstName} ${lastName}`,
            mobile,
            email,
            // முகவரி விவரங்களைச் சேர்க்கவும்
            address: {
                line1: address1,
                line2: address2,
                state: state,
                district: district,
                pincode: pincode
            },
            partnerCode,
            referralCode,
            username,
            password: hashedPassword,
            functionalArea,
            role: 'PARTNER',
            status: 'active'
        });

        await newPartner.save();
        res.redirect('/partner-list'); 
    } catch (error) {
        console.error("Error:", error);
        res.status(500).send("Error adding partner: " + error.message);
    }
});
app.post('/admin/partner/update/:id', async (req, res) => {
    try {
        const { 
            name, mobile, email, address1, address2, state, district, 
            pincode, partnerCode, referralCode, username, password, functionalArea 
        } = req.body;

        const updateData = {
            name, mobile, email, address1, address2, state, district, 
            pincode, partnerCode, referralCode, username, functionalArea 
        };

        // பாஸ்வேர்ட் கொடுத்தால் மட்டும் அப்டேட் செய்ய (பாதுகாப்புக்காக)
        if (password && password.trim() !== "") {
            updateData.password = password; // கவனிக்கவும்: இங்கே பாஸ்வேர்டை hashing செய்து சேமிப்பது நல்லது
        }

        await User.findByIdAndUpdate(req.params.id, updateData);
        
        res.redirect('/partner-list'); // அப்டேட் முடிந்ததும் மீண்டும் அதே பக்கத்திற்குச் செல்ல
    } catch (error) {
        console.error(error);
        res.status(500).send("Update failed: " + error.message);
    }
});
// பார்ட்னர் எடிட் பக்கத்தை காண்பிக்க (GET Route)
app.get('/admin/partner/edit/:id', async (req, res) => {
    try {
        const partner = await User.findById(req.params.id);
        if (!partner) {
            return res.status(404).send("Partner not found");
        }
        res.render('edit_partner', { partner }); // edit_partner.ejs என்ற கோப்பு தேவை
    } catch (error) {
        console.error("Error loading edit page:", error);
        res.status(500).send("Server Error");
    }
});
// --- List Routes ---
// --- Updated List Routes ---

app.get('/partner-list', async (req, res) => {
    if (!req.session.loggedIn || req.session.role !== 'ADMIN') return res.redirect('/partner/login');
    const partners = await User.find({ role: 'PARTNER' });
    res.render('partner_list', { partners: partners }); 
});

app.get('/vendor-list', async (req, res) => {
    if (!req.session.loggedIn || req.session.role !== 'ADMIN') return res.redirect('/partner/login');
    const vendors = await User.find({ role: 'VENDOR' });
    res.render('vendor_list', { vendors: vendors }); 
});

app.get('/customer-list', async (req, res) => {
    if (!req.session.loggedIn || req.session.role !== 'ADMIN') return res.redirect('/partner/login');
    const customers = await User.find({ role: 'CUSTOMER' });
    res.render('customer_list', { customers: customers }); 
});
// Save / Update API Route with Automatic Bcrypt Encryption
app.post('/admin/partner/save', async (req, res) => {
    if (!req.session.loggedIn || req.session.role !== 'ADMIN') {
        return res.status(403).json({ success: false, message: 'Unauthorized access!' });
    }

    try {
        const { id, code, name, company, mobile, email, username, password, status, type, areas } = req.body;

        if (!username || !name) {
            return res.status(400).json({ success: false, message: 'Missing required fields!' });
        }

        let assignedRole = 'PARTNER';
        if (type && type.toLowerCase() === 'vendor') assignedRole = 'VENDOR';

        // Hash password if provided and not already hashed
        let hashedPassword = null;
        if (password) {
            const cleanPassword = password.toString().trim();
            if (!cleanPassword.startsWith('$2b$') && !cleanPassword.startsWith('$2a$')) {
                const salt = await bcrypt.genSalt(10);
                hashedPassword = await bcrypt.hash(cleanPassword, salt);
            } else {
                hashedPassword = cleanPassword;
            }
        }

        if (id) {
            // Update Existing User
            const updateData = {
                code: code,
                name: name,
                company: company,
                mobile: mobile,
                email: email,
                username: username.trim(),
                status: status || 'active',
                role: assignedRole,
                areas: areas || []
            };

            if (hashedPassword) {
                updateData.password = hashedPassword;
            }

            const updatedUser = await User.findByIdAndUpdate(id, updateData, { new: true });

            if (!updatedUser) {
                return res.status(404).json({ success: false, message: 'User not found!' });
            }
            return res.json({ success: true, message: 'User details updated permanently!' });
        } else {
            // Create New User
            const userExists = await User.findOne({ username: username.trim() });
            if (userExists) {
                return res.status(400).json({ success: false, message: 'Username already registered!' });
            }

            if (!password) {
                return res.status(400).json({ success: false, message: 'Password is required for new users!' });
            }

            const newUser = new User({
                code: code,
                name: name,
                company: company,
                mobile: mobile,
                email: email,
                username: username.trim(),
                password: hashedPassword,
                role: assignedRole,
                balance: 0,
                status: status || 'active',
                areas: areas || []
            });

            await newUser.save();
            return res.json({ success: true, message: 'User registered permanently in database!' });
        }
    } catch (error) {
        console.error("Save Error:", error);
        return res.status(500).json({ success: false, message: 'Database Save Failed!' });
    }
});

// Master Dashboard View
app.get('/admin/dashboard', async (req, res) => {
    if (!req.session.loggedIn || req.session.role !== 'ADMIN') return res.redirect('/partner/login');

    let dbUsers = [];
    let dbRequests = [];
    let adminObj = { name: "Manimaran Admin", balance: 100000.00 };

    if (isMongoConnected) {
        try {
            dbUsers = await User.find({ role: { $ne: 'ADMIN' } });
            dbRequests = await CashRequest.find({ status: 'Pending' });
            const foundAdmin = await User.findOne({ username: 'manimaran' });
            if (foundAdmin) adminObj = foundAdmin;
        } catch(err) {
            console.log("DB Fetch Error:", err.message);
        }
    }

    const dummyPlans = {
        MOBILE_RECHARGE: {
            JIO: [{ amount: 239, validity: '28 Days', desc: '1.5GB/Day' }],
            AIRTEL: [{ amount: 299, validity: '28 Days', desc: '2GB/Day' }],
            BSNL: [{ amount: 199, validity: '30 Days', desc: 'Unlimited Calls' }]
        },
        DTH_RECHARGE: {
            SUN_DIRECT: [{ amount: 150, validity: '1 Month', desc: 'Tamil Basic' }],
            TATA_PLAY: [{ amount: 220, validity: '1 Month', desc: 'Sports Pack' }]
        }
    };

    res.render('dashboard', {
        adminUser: adminObj,
        users: dbUsers,
        cashRequests: dbRequests,
        plans: dummyPlans
    });
});
// உங்கள் ஏற்கனவே உள்ள கோட் பகுதிக்கு அடியில் இதைச் சேர்க்கவும்:

app.get('/home', (req, res) => {
    if (!req.session.loggedIn) return res.redirect('/partner/login');

    // ரோலுக்கு ஏற்ப அந்தந்த டேஷ்போர்டிற்கு திருப்பி விடவும்
    if (req.session.role === 'ADMIN') return res.redirect('/admin/dashboard');
    if (req.session.role === 'PARTNER') return res.redirect('/partner/dashboard');
    if (req.session.role === 'VENDOR') return res.redirect('/vendor/dashboard');

    res.redirect('/partner/login');
});

app.get('/partner/dashboard', (req, res) => {
    if (!req.session.loggedIn || req.session.role !== 'PARTNER') return res.redirect('/partner/login');
    res.send(`<h1>Welcome Partner ${req.session.name} to Your Dashboard!</h1>`);
});

app.get('/vendor/dashboard', (req, res) => {
    if (!req.session.loggedIn || req.session.role !== 'VENDOR') return res.redirect('/partner/login');
    res.send(`<h1>Welcome Vendor ${req.session.name} to Vendor Workspace!</h1>`);
});

// --- புதிய சப்-மெனு ரவுட்டுகள் ---

app.get('/admin/partner/add', (req, res) => {
    if (!req.session.loggedIn || req.session.role !== 'ADMIN') return res.redirect('/partner/login');
    res.render('add_partner'); 
});

app.get('/admin/vendor/add', (req, res) => {
    if (!req.session.loggedIn || req.session.role !== 'ADMIN') return res.redirect('/partner/login');
    res.render('add_vendor'); 
});

app.get('/admin/customer/add', (req, res) => {
    if (!req.session.loggedIn || req.session.role !== 'ADMIN') return res.redirect('/partner/login');
    res.render('add_customer'); 
});

// ---------------------------

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ETECH Live on Port ${PORT}`));
