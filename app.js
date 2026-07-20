// ==========================================
// பார்ட்னர் லாகின் ரூட் (POST Gateway) - FIXED
// ==========================================
app.post('/partner/login', async (req, res) => {
    try {
        const { username, password } = req.body; 

        if (!username || !password) {
            return res.status(400).render('partner_login', { error: 'தயவுசெய்து மொபைல் எண் மற்றும் பாஸ்வேர்டை உள்ளிடவும்!' });
        }

        // டேட்டாபேஸில் மொபைல் எண் மூலமாக பார்ட்னரைத் தேடுகிறது (PartnerModel அல்லது உங்கள் மாடல் பெயர்)
        // குறிப்பு: உங்கள் மாடல் பெயர் 'Partner' எனில்: mongoose.model('Partner')
        const PartnerModel = mongoose.models.Partner || mongoose.model('Partner');
        const partner = await PartnerModel.findOne({ mobile: username.trim() });

        if (!partner) {
            console.log(`Login failed: Mobile ${username} not found.`);
            return res.status(400).render('partner_login', { error: 'Invalid Username or Password!' });
        }

        // 🔴 அட்மின் கணக்கை முடக்கியிருந்தால் லாகின் செய்ய விடக்கூடாது
        if (partner.status === 'Inactive' || partner.status === 'Suspend') {
            return res.status(403).render('partner_login', { 
                error: `உங்கள் கணக்கு அட்மினால் தற்காலிகமாக ${partner.status} செய்யப்பட்டுள்ளது. தயவுசெய்து அட்மினைத் தொடர்பு கொள்ளவும்.` 
            });
        }

        // 🔐 பாஸ்வேர்ட் சரிபார்ப்பு லாஜிக் (Plain text மற்றும் Bcrypt இரண்டையும் செக் செய்யும்)
        let isPasswordValid = false;
        if (partner.password.startsWith('$2b$') || partner.password.startsWith('$2a$')) {
            const bcrypt = require('bcrypt');
            isPasswordValid = await bcrypt.compare(password, partner.password);
        } else {
            isPasswordValid = (password === partner.password);
        }

        if (!isPasswordValid) {
            console.log(`Login failed: Password mismatch for ${username}.`);
            return res.status(400).render('partner_login', { error: 'Invalid Username or Password!' });
        }

        // 🎟️ செஷனில் விவரங்களைச் சேமித்தல்
        req.session.partnerLoggedIn = true;
        req.session.partnerId = partner.partnerId;
        req.session.partnerName = partner.contactPerson;
        req.session.firmName = partner.firmName;
        req.session.partnerMobile = partner.mobile;

        console.log(`Login success: ${partner.contactPerson} (#${partner.partnerId}) logged in.`);
        
        // 🚀 லாகின் ஆனவுடன் நேரடியாக பார்ட்னர் ஹோம்ப்ேஜிற்கு லேண்ட் ஆகிறது
        return res.redirect('/partner/homepage');

    } catch (error) {
        console.error("Partner Login Error: ", error);
        return res.status(500).render('partner_login', { error: 'சர்வரில் தொழில்நுட்ப கோளாறு ஏற்பட்டுள்ளது!' });
    }
});

// ==========================================
// பார்ட்னர் வெற்றிகரமாக லேண்ட் ஆகும் ஹோம்ப்ேஜ் ரூட் (GET)
// ==========================================
app.get('/partner/homepage', async (req, res) => {
    try {
        if (!req.session.partnerLoggedIn) {
            return res.redirect('/partner/login');
        }

        const PartnerModel = mongoose.models.Partner || mongoose.model('Partner');
        const partnerDetails = await PartnerModel.findOne({ partnerId: req.session.partnerId });

        res.render('partner_homepage', {
            partnerName: req.session.partnerName,
            firmName: req.session.firmName,
            partnerId: req.session.partnerId,
            mobile: req.session.partnerMobile,
            partner: partnerDetails
        });
    } catch (error) {
        console.error("Error loading partner homepage:", error);
        res.status(500).send("Internal Server Error");
    }
});

// ==========================================
// பார்ட்னர் லாக்-அவுட் ரூட் (GET)
// ==========================================
app.get('/partner/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/partner/login');
    });
});
