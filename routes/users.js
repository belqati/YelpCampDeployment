let express = require("express");
let router = express.Router({mergeParams: true});
let passport = require("passport");
let User = require("../models/user");
let Campground = require("../models/campground");
// N.B.: index.js is a file name that is automatically loaded by express, so only its directory is required
let middleware = require("../middleware");

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

// INDEX route -- show all users
router.get("/", function(req, res) {
  // pagination for all users
  let perPage = 6;
  let pageQuery = parseInt(req.query.page);
  let pageNumber = pageQuery ? pageQuery : 1;
  let noMatch = null;

  // GET all users from DB
  User.find({}).skip((perPage * pageNumber) - perPage).limit(perPage).exec(function(err, allUsers) {
    User.count().exec(function(err, count) {
      if(err) {
        console.log(err);
        req.flash("error", err.message);
        return res.redirect("back");
      } else {
        res.render("users/index", {
          users: allUsers,
          current: pageNumber,
          pages: Math.ceil(count / perPage),
          noMatch: noMatch,
          search: false
        });
      }
    });
  });
});

// AUTHENTICATION routes
// NEW/Register route for new user
router.get("/register", function(req, res) {
  res.render("users/register");
});

// CREATE route -- add new user to DB from form
router.post("/", upload.single("avatar"), function(req, res) {

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
        // built-in passport error message
        req.flash("error", err.message);
        return res.redirect("back");
      }
      // login/auth newly created user
      passport.authenticate("local")(req, res, function() {
        req.flash("success", "Welcome to YelpCamp " + user.username + "!")
        // res.render("/users");
        res.redirect("/users/" + user._id);
      });
    });

  });
});

// SHOW route -- shows all info for a specific user
router.get("/:user_id", function(req, res) {
  // find user via MongoDB id
  User.findById(req.params.user_id, function(err, itemObj) {
    // check if err OR itemObj is null
    // must handle null or it will pass and crash the application, because null.image etc. does not exist
    if(err || !itemObj) {
      req.flash("error", "User not found!");
      res.redirect("back");
    } else {
      // find user's campgrounds
      Campground.find().where("author.id").equals(itemObj._id).exec(function(err, campgrounds) {
        if(err) {
          req.flash("error", "Oops, something went wonky!");
          res.redirect("back");
        }
        console.log(itemObj);
        console.log(campgrounds)
        // render show page template
        res.render("users/show", {user: itemObj, campgrounds: campgrounds});
      });
    }
  });
});

// EDIT route -- edit form for specific user
// middleware: checks for user auth and authorization
router.get("/:user_id/edit", middleware.checkUserOwnership, function(req, res) {
  User.findById(req.params.user_id, function(err, founduser) {
    if(err) {
      res.redirect("/users");
    } else {
      res.render("users/edit", {user: founduser});
    }
  });
});

// UPDATE route -- update specific user and redirect
router.put("/:user_id", middleware.checkUserOwnership, upload.single("avatar"), function(req, res) {

  User.findById(req.params.user_id, async function(err, user) {

    if(err) {
      req.flash("error", err.message);
      res.redirect("back");
    } else {

      // update avatar (see CREATE route)
      if (req.file) {
        try {
          await cloudinary.v2.uploader.destroy(user.avatarId, {invalidate: true});
          // for image moderation add with folder option {..., moderation: "webpurify"} or {..., moderation: "aws_rek"}
          let result = await cloudinary.v2.uploader.upload(req.file.path, {folder: "yelp_camp/users"});
          user.avatarId = result.public_id;
          user.avatar = result.secure_url;
        } catch(err) {
          req.flash("error", err.message);
          return res.redirect("back");
        }
      }

      // function to check for and update new password (see CREATE route)
      function newPW(){
        if(req.body.password === req.body.confirm) {
          user.setPassword(req.body.password, function(err) {
            user.save();
          });
        } else {
          req.flash("error", "Oops, passwords do not match.");
          return res.redirect('back');
        }
      }

      // update data from other form fields
      user.username = req.body.user.username;
      user.firstName = req.body.user.firstName;
      user.lastName = req.body.user.lastName;
      user.userBackground = req.body.user.userBackground;
      user.email = req.body.user.email;
      // save pic and form data to user object
      await user.save();
      // if new password save new hash to user object
      await newPW();

      // log user back in after update
      req.logIn(user, function(err) {
        if(err) {
          req.flash("error", err.message);
          return res.redirect("back");
        }
      });

      // check if multer fileFilter added "fileValidationError" to req object 
      if(req.fileValidationError) {
        req.flash("error", "Sorry, only .jpg, .jpeg, and .png files are allowed.");
        return res.redirect("back");
      }

      req.flash("success", "Your profile was successfully updated!");
      res.redirect("/users/" + user._id);

    }
  });
});

// DESTROY route -- remove specific user
router.delete("/:user_id", middleware.checkUserOwnership, function(req, res) {

  User.findById(req.params.user_id, async function(err, user) {
    if(err) {
      req.flash("error", err.message);
      return res.redirect("/users");
    }
    try {
      await cloudinary.v2.uploader.destroy(user.avatarId);
      user.remove();
      req.flash("success", "Profile removed successfully.")
      res.redirect("/users");
    } catch(err) {
      req.flash("error", err.message);
      return res.redirect("/users");
    }
  });
});

// function for fuzzy search using regex
function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
};

module.exports = router;