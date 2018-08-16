let express = require("express");
let router = express.Router();
let passport = require("passport");
let User = require("../models/user");

// password reset: use user email via async, nodemailer, and crypto
let async = require("async");
let nodemailer = require("nodemailer");
// crypto is included with nodejs
let crypto = require("crypto");

router.get("/", function(req, res) {
  res.render("landing");
});

// Login form
router.get("/login", function(req, res) {
  res.render("login");
});

// Login logic via passport
router.post("/login", passport.authenticate("local", 
  {
    successRedirect: "/campgrounds",
    successFlash: "Login successful!",
    failureRedirect: "/login",
    failureFlash: true
  }), function(req, res) {
});

// Logout route
router.get("/logout", function(req, res) {
  req.logout();
  req.flash("success", "Logout successful!")
  res.redirect("/campgrounds");
});

// FORGOTPW form
router.get("/forgotpw", function(req, res) {
  res.render("forgotpw");
});

// FORGOTPW validation
router.post('/forgotpw', function(req, res, next) {
  async.waterfall([
    function(done) {
      // create random encrypted token
      crypto.randomBytes(20, function(err, buf) {
        let token = buf.toString('hex');
        done(err, token);
      });
    },
    // compare entered email to DB user.email, on match add encrypted token to user object, make it valid for one hour
    function(token, done) {
      User.findOne({ email: req.body.email }, function(err, user) {
        if(err || !user) {
          req.flash("error", "No YelpCamp account with that email address exists.");
          return res.redirect("/forgotpw");
        }

        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000;
        user.save(function(err) {
          if(err) {
            req.flash("error", "Tokens not saved!");
            return res.redirect("/forgotpw");
          }
          done(err, token, user);
        });
      });
    },

    // send new token-url to matched email
    function(token, user, done) {
      let smtpTransport = nodemailer.createTransport({
        service: "Gmail", 
        auth: {
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
        if(err) {
          req.flash("error", "Email token not sent!");
          return res.redirect("/forgotpw");
        }
        req.flash('success', 'An email has been sent to ' + user.email + ' with further instructions.');
        done(err, 'done');
      });

    }
  ], function(err) {
    if (err) return next(err);
    res.redirect('/forgotpw');
  });
});

// token-url: if valid and timely ($gt = 'greater than') render reset form 
router.get('/resetpw/:token', function(req, res) {
  User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }, function(err, user) {
    if (err || !user) {
      req.flash('error', 'Password reset token is invalid or has expired.');
      return res.redirect('/forgotpw');
    }
    res.render('resetpw', {token: req.params.token});
  });
});

// update password logic
router.post('/resetpw/:token', function(req, res) {
  async.waterfall([
    function(done) {
      // check for valid and current token 
      User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }, function(err, user) {
        if (!user) {
          req.flash('error', 'Password reset token is invalid or has expired.');
          return res.redirect('back');
        }
        // check that new password and confirm password are the same
        if(req.body.password === req.body.confirm) {
          // use built-in encryption method via passport-local-mongoose in User model to re-salt/hash new password
          user.setPassword(req.body.password, function(err) {
            if(err) {
              req.flash("error", "Sorry, password reset failed.");
              return res.redirect("/forgotpw");
            }
            // remove tokens from user object
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
            user.save(function(err) {
              if(err) {
                req.flash("error", "Something went wonky!");
              }
              req.logIn(user, function(err) {
                if(err) {
                  req.flash("error", "Something went wonky!");
                }
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
    // notify user.email of password change
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
        if(err) {
          req.flash("error", "Sorry, password reset failed!");
          return res.redirect("/forgotpw");
        }
        req.flash('success', 'Password successfully reset!');
        done(err);
      });
    }
  ], function(err) {
    if(err) {
      req.flash("error", "Sorry, password reset failed!");
      return res.redirect("/forgotpw");
    }
    res.redirect('/campgrounds');
  });
});

module.exports = router;