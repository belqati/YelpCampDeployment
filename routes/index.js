let express = require("express");
let router = express.Router();
let passport = require("passport");
let User = require("../models/user");
// for password reset w/ user email via async, nodemailer, and crypto
let async = require("async");
let nodemailer = require("nodemailer");
// crypto is included with nodejs
let crypto = require("crypto");

// config multer, used for file interaction via form input
let multer = require("multer");
let storage = multer.diskStorage({
  filename: function(req, file, callback) {
    callback(null, Date.now() + file.originalname);
  }
});
let imageFilter = function(req, file, cb) {
  // accept certain image files only
  if(!file.originalname.match(/\.(jpg|jpeg|png)$/i)) {
    // pass new item to req object, accessible to req object in routes
    req.fileValidationError = "incorrect file type";
    return cb(null, false);
  }
  cb(null, true);
};
let upload = multer({storage: storage, fileFilter: imageFilter});

// config cloudinary, used for file hosting and manipulation
// N.B.: allowing user uploads opens door to questionable content--Cloudinary has tools to check for this (human moderation via WebPurify; AI moderation via aws Rekognition); the former is fast, the latter instantaneous
let cloudinary = require("cloudinary");
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_USER,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_SECRET
});

router.get("/", function(req, res) {
  res.render("landing");
});

// AUTHENTICATION routes
// Register routes
router.get("/register", function(req, res) {
  res.render("register");
});

// CREATE route -- add new user to DB from form
router.post("/register", upload.single("avatar"), function(req, res) {

  // check if multer fileFilter added "fileValidationError" to req object 
  if(req.fileValidationError) {
    req.flash("error", "Sorry, only .jpg, .jpeg, and .png files are allowed.");
    return res.redirect("back");
  }

  // upload to cloudinary; folder option allows for media organization in cloud media library
  // for image moderation add with folder option {..., moderation: "webpurify"} or {..., moderation: "aws_rek"}
  cloudinary.v2.uploader.upload(req.file.path, {folder: "yelp_camp/users"}, function(err, result) {
    if(err) {
      req.flash("error", err.message);
      return res.redirect("back");
    }

    // create cloudinary url and id for avatar for user object
    let avatar = result.secure_url;
    let avatarId = result.public_id;

    // incorporate newUser object in cloudinary scope
    let newUser = new User({
      username: req.body.username,
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      email: req.body.email,
      avatar: avatar,
      avatarId: avatarId,
      userBackground: req.body.userBackground
    });

    // adds newUser and hashed password to DB via passport-mongoose
    User.register(newUser, req.body.password, function(err, user) {
      if(err) {
        // passport has built in error messages, so writing them is not necessesary
        req.flash("error", err.message);
        return res.redirect("back");
      }
      // login/auth newly created user
      passport.authenticate("local")(req, res, function() {
        req.flash("success", "Welcome to YelpCamp " + user.username + "!")
        res.render("/users");
        // res.render("users/show", {user: user});
      });
    });
  });
});

// Login routes -- show login form
router.get("/login", function(req, res) {
  res.render("login");
});

// handle login logic
// middleware auth user via passport-mongoose
router.post("/login", passport.authenticate("local", 
  {
    successRedirect: "/campgrounds",
    failureRedirect: "/login"
  }), function(req, res) {
});

// Logout route
router.get("/logout", function(req, res) {
  req.logout();
  req.flash("success", "You are now logged out!")
  res.redirect("/campgrounds");
});

// FORGOTPW & RESETPW ROUTES
router.get("/forgotpw", function(req, res) {
  res.render("forgotpw");
});

router.post('/forgotpw', function(req, res, next) {
  // async mitigates callbackHell by placing each related function in an array
  async.waterfall([
    function(done) {
      // create a random encrypted token
      crypto.randomBytes(20, function(err, buf) {
        let token = buf.toString('hex');
        done(err, token);
      });
    },
    // compare entered email to user.email in DB, on match add encrypted token to their object, make it valid for one hour, save user
    function(token, done) {
      User.findOne({ email: req.body.email }, function(err, user) {
        if (!user) {
          req.flash('error', 'No YelpCamp account with that email address exists.');
          return res.redirect('/forgotpw');
        }

        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000;
        user.save(function(err) {
          done(err, token, user);
        });
      });
    },
    // send to matched email their new token in url
    function(token, user, done) {
      let smtpTransport = nodemailer.createTransport({
        service: 'Gmail', 
        auth: {
          // using dotenv package, keys and passwords in .env file
          user: process.env.GMAILUSER,
          pass: process.env.GMAILPW
        }
      });
      let mailOptions = {
        to: user.email,
        from: process.env.GMAILUSER,
        subject: 'YelpCamp Password Reset Requested',
        text: 'You (or someone else) have requested a password reset token for your YelpCamp account.\n\n' +
          'Please click on the following link, or paste it into your browser to continue the reset process:\n\n' +
          'http://' + req.headers.host + '/resetpw/' + token + '\n\n' +
          'If you did not request this reset, please ignore this message and your YelpCamp password will remain unchanged.\n'
      };
      smtpTransport.sendMail(mailOptions, function(err) {
        console.log('mail sent');
        req.flash('success', 'An email has been sent to ' + user.email + ' with further instructions.');
        done(err, 'done');
      });

    }
  ], function(err) {
    if (err) return next(err);
    res.redirect('/forgotpw');
  });
});

// url with encrypted key, if valid render reset form
router.get('/resetpw/:token', function(req, res) {
  User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }, function(err, user) {
    if (!user) {
      req.flash('error', 'Your password reset token is invalid or has expired.');
      return res.redirect('/forgotpw');
    }
    res.render('resetpw', {token: req.params.token});
  });
});

router.post('/resetpw/:token', function(req, res) {
  async.waterfall([
    function(done) {
      // check that token in user object is valid and not expired, where $gt is 'greater than'
      User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }, function(err, user) {
        if (!user) {
          req.flash('error', 'Your password reset token is invalid or has expired.');
          return res.redirect('back');
        }
        // check that user input for password and confirm password are the same
        if(req.body.password === req.body.confirm) {
          // use built-in encryption method via passport-local-mongoose in User model to re-salt/hash new password
          user.setPassword(req.body.password, function(err) {
            // empty token related variables in user object, and save
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
            user.save(function(err) {
              req.logIn(user, function(err) {
                done(err, user);
              });
            });
          })
        } else {
          req.flash("error", "Oops, passwords do not match.");
          return res.redirect('back');
        }
      });
    },
    // notify user.email that their password has been changed
    function(user, done) {
      let smtpTransport = nodemailer.createTransport({
        service: 'Gmail', 
        auth: {
          user: process.env.GMAILUSER,
          pass: process.env.GMAILPW
        }
      });
      let mailOptions = {
        to: user.email,
        from: process.env.GMAILUSER,
        subject: 'Your YelpCamp Password has Changed',
        text: 'Hello,\n\n' +
          'This is a confirmation that the password for your YelpCamp account ' + user.email + ' has been successfully reset.\n'
      };
      smtpTransport.sendMail(mailOptions, function(err) {
        req.flash('success', 'Your password has been successfully reset.');
        done(err);
      });
    }
  ], function(err) {
    res.redirect('/campgrounds');
  });
});

module.exports = router;