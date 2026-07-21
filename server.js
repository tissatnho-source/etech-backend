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
    saveUninitialized: false, 
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

// User Schema (District மற்றும் functionalArea சேர்த்து அப்டேட் செய்யப்பட்டுள்ளது)
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    company: { type: String },
    mobile: { type: String },
    email: { type: String },
    code: { type: String },
    partnerCode: { type: String },
    referralCode: { type: String },
    district: { type: String }, // District சேர்க்கப்பட்டுள்ளது
    role: { type: String, enum: ['ADMIN', 'PARTNER', 'VENDOR', 'CUSTOMER'], required: true },
    balance: { type: Number, default: 0 },
    status: { type: String, default: 'active' },
    functionalArea: { type: String }, // Functional Area-விற்காக
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

// Setup default Admin
async function setupDefaultAdmin() {
    try {
        if (!isMongoConnected) return;
        const adminExists = await User.findOne({ username: 'manimaran' });
        if (!adminExists) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('123', salt);

            const newAdmin = new User({
                username: 'manimaran',
                password: hashedPassword,
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

// --- Routes ---

app.get('/', (req, res) => {
    if (!req.session || !req.session.loggedIn) {
        return res.redirect('/partner/login');
    }
    if (req.session.role === 'ADMIN') return res.redirect('/admin/dashboard');
    if (req.session.role === 'PARTNER') return res.redirect('/partner/dashboard');
    if (req.session.role === 'VENDOR') return res.redirect('/vendor/dashboard');

    res.redirect('/partner/login');
});

app.get('/home', (req, res) => {
    res.redirect('/');
});

app.get('/partner/login', (req, res) => {
    if (req.session && req.session.loggedIn) {
        if (req.session.role === 'ADMIN') return res.redirect('/admin/dashboard');
        if (req.session.role === 'PARTNER') return res.redirect('/partner/dashboard');
        if (req.session.role === 'VENDOR') return res.redirect('/vendor/dashboard');
    }
    res.render('partner_login', { error: null });
});

app.get('/logout', (req, res) => {
    if (req.session) {
        req.session.destroy((err) => {
            if (err) console.log(err);
            res.clearCookie('connect.sid');
            res.redirect('/partner/login');
        });
    } else {
        res.clearCookie('connect.sid');
        res.redirect('/partner/login');
    }
});

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

                    if (user.role === 'ADMIN') return res.redirect('/admin/dashboard');
                    if (user.role === 'PARTNER') return res.redirect('/partner/dashboard');
                    if (user.role === 'VENDOR') return res.redirect('/vendor/dashboard');
                    return res.redirect('/');
                }
            }
        } else {
            if (trimmedUser === 'manimaran' && trimmedPass === '123') {
                req.session.loggedIn = true;
                req.session.userId = 'admin_local_id_999';
                req.session.username = 'manimaran';
                req.session.name = 'Manimaran Admin';
                req.session.role = 'ADMIN';
                return res.redirect('/admin/dashboard');
            }
        }

        return res.render('partner_login', { error: 'Invalid Username or Password!' });
    } catch (error) {
        console.error("Login Error:", error);
        return res.render('partner_login', { error: 'System technical error occurred!' });
    }
});

// --- Dashboards ---

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

app.get('/partner/dashboard', (req, res) => {
    if (!req.session.loggedIn || req.session.role !== 'PARTNER') return res.redirect('/partner/login');
    res.send(`<h1>Welcome Partner ${req.session.name} to Your Dashboard!</h1><br><a href="/logout">Logout</a>`);
});

app.get('/vendor/dashboard', (req, res) => {
    if (!req.session.loggedIn || req.session.role !== 'VENDOR') return res.redirect('/partner/login');
    res.send(`<h1>Welcome Vendor ${req.session.name} to Vendor Workspace!</h1><br><a href="/logout">Logout</a>`);
});

// --- List Routes ---

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

// --- Partner / Vendor Add & Update Routes ---

app.post('/admin/partner/save', async (req, res) => {
    if (!req.session.loggedIn || req.session.role !== 'ADMIN') {
        return res.status(403).json({ success: false, message: 'Unauthorized access!' });
    }

    try {
        const { id, code, partnerCode, referralCode, name, company, mobile, email, district, username, password, status, type, functionalArea, areas } = req.body;

        if (!username || !name) {
            return res.status(400).json({ success: false, message: 'Missing required fields!' });
        }

        let assignedRole = 'PARTNER';
        if (type && type.toLowerCase() === 'vendor') assignedRole = 'VENDOR';

        let hashedPassword = null;
        if (password) {
            const cleanPassword = password.toString().trim();
            if (cleanPassword !== "") {
                if (!cleanPassword.startsWith('$2b$') && !cleanPassword.startsWith('$2a$')) {
                    const salt = await bcrypt.genSalt(10);
                    hashedPassword = await bcrypt.hash(cleanPassword, salt);
                } else {
                    hashedPassword = cleanPassword;
                }
            }
        }

        // Functional Area Checkbox-களை string அல்லது array-ஆக மாற்றிக்கொள்ளுதல்
        let fAreaString = Array.isArray(functionalArea) ? functionalArea.join(', ') : functionalArea;

        if (id) {
            const updateData = {
                code: code || partnerCode,
                partnerCode: partnerCode,
                referralCode: referralCode,
                name: name,
                company: company,
                mobile: mobile,
                email: email,
                district: district,
                username: username.trim(),
                status: status || 'active',
                role: assignedRole,
                functionalArea: fAreaString,
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
            const userExists = await User.findOne({ username: username.trim() });
            if (userExists) {
                return res.status(400).json({ success: false, message: 'Username already registered!' });
            }

            if (!password) {
                return res.status(400).json({ success: false, message: 'Password is required for new users!' });
            }

            const newUser = new User({
                code: code || partnerCode,
                partnerCode: partnerCode,
                referralCode: referralCode,
                name: name,
                company: company,
                mobile: mobile,
                email: email,
                district: district,
                username: username.trim(),
                password: hashedPassword,
                role: assignedRole,
                balance: 0,
                status: status || 'active',
                functionalArea: fAreaString,
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

// Extra Support Route for Update via Params (நீங்கள் முன்பு கேட்ட எடிட் பிரச்சனைக்கு தீர்வு)
app.post('/admin/partner/update/:id', async (req, res) => {
    if (!req.session.loggedIn || req.session.role !== 'ADMIN') return res.redirect('/partner/login');
    try {
        const partnerId = req.params.id;
        const { name, mobile, email, district, partnerCode, referralCode, username, password, functionalArea } = req.body;

        let fAreaString = Array.isArray(functionalArea) ? functionalArea.join(', ') : functionalArea;

        let updateData = {
            name,
            mobile,
            email,
            district,
            partnerCode,
            referralCode,
            username,
            functionalArea: fAreaString
        };

        if (password && password.trim() !== "") {
            const salt = await bcrypt.genSalt(10);
            updateData.password = await bcrypt.hash(password.trim(), salt);
        }

        await User.findByIdAndUpdate(partnerId, updateData);
        res.redirect('/partner-list');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error updating partner");
    }
});

// Sub-menu rendering routes
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

app.get('/admin/partner/edit/:id', async (req, res) => {
    try {
        if (!req.session.loggedIn || req.session.role !== 'ADMIN') return res.redirect('/partner/login');
        const partner = await User.findById(req.params.id);
        if (!partner) {
            return res.status(404).send("Partner not found");
        }
        res.render('edit_partner', { partner });
    } catch (error) {
        console.error("Error loading edit page:", error);
        res.status(500).send("Server Error");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ETECH Live on Port ${PORT}`));
