let express = require("express");
let router = express.Router({mergeParams: true});
let passport = require("passport");
let User = require("../models/user");
let Campground = require("../models/campground");
let middleware = require("../middleware");

let multer = require("multer");
let storage = multer.diskStorage({
  filename: function(req, file, callback) {
    callback(null, Date.now() + file.originalname);
  }
});
let imageFilter = function(req, file, cb) {
  if(!file.originalname.match(/\.(jpg|jpeg|png)$/i)) {
    req.fileValidationError = "incorrect file type";
    return cb(null, false);
  }
  cb(null, true);
};
let upload = multer({storage: storage, fileFilter: imageFilter});

let cloudinary = require("cloudinary");
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_USER,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_SECRET
});

// INDEX route -- show all users
router.get("/", function(req, res) {
  // paginate all users
  let perPage = 6;
  let pageQuery = parseInt(req.query.page);
  let pageNumber = pageQuery ? pageQuery : 1;
  let noMatch = null;

  User.find({}).skip((perPage * pageNumber) - perPage).limit(perPage).exec(function(err, allUsers) {
    if(err) {
      req.flash("error", "Something went awry!");
      return res.redirect("back");
    }
    User.count().exec(function(err, count) {
      if(err) {
        req.flash("error", err.message);
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
// NEW/Register form for new user
router.get("/register", function(req, res) {
  res.render("users/register");
});

// CREATE route -- add new user to DB from form
router.post("/", upload.single("avatar"), function(req, res) {

  if(req.fileValidationError) {
    req.flash("error", "Sorry, only .jpg, .jpeg, and .png files are allowed.");
    return res.redirect("back");
  }

  // moderation: {..., moderation: "webpurify"} or {..., moderation: "aws_rek"}
  cloudinary.v2.uploader.upload(req.file.path, {folder: "yelp_camp/users", moderation: "webpurify"}, function(err, result) {
    if(err) {
      req.flash("error", "Upload failed!");
      return res.redirect("back");
    }

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

    // add newUser and hashed password to DB via passport-mongoose
    User.register(newUser, req.body.password, function(err, user) {
      if(err) {
        req.flash("error", err.message);
        return res.redirect("back");
      }
      // auth and login created user
      passport.authenticate("local")(req, res, function() {
        req.flash("success", "Welcome to YelpCamp " + user.username + "!")
        res.redirect("/users/" + user._id);
      });
    });

  });
});

// SHOW route -- show user
router.get("/:user_id", function(req, res) {
  User.findById(req.params.user_id, function(err, itemObj) {
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
        res.render("users/show", {user: itemObj, campgrounds: campgrounds});
      });
    }
  });
});

// EDIT route -- edit user
router.get("/:user_id/edit", middleware.checkUserOwnership, function(req, res) {

  User.findById(req.params.user_id, function(err, founduser) {
    if(err) {
      req.flash("error", "Hmmm, editing is not currently available.");
      res.redirect("/users");
    }
    res.render("users/edit", {user: founduser});
  });
});

// UPDATE route -- update user
router.put("/:user_id", middleware.checkUserOwnership, upload.single("avatar"), function(req, res) {

  User.findById(req.params.user_id, async function(err, user) {

    if(err) {
      req.flash("error", err.message);
      res.redirect("back");
    } else {

    if (req.file) {
      try {
        await cloudinary.v2.uploader.destroy(user.avatarId, {invalidate: true});
        // moderation: {..., moderation: "webpurify"} or {..., moderation: "aws_rek"}
        let result = await cloudinary.v2.uploader.upload(req.file.path, {folder: "yelp_camp/users", moderation: "webpurify"});
        user.avatarId = result.public_id;
        user.avatar = result.secure_url;
      } catch(err) {
        req.flash("error", err.message);
        return res.redirect("back");
      }
    }

    // update new password (cf. CREATE route)
    function newPW(){
      if(req.body.password === req.body.confirm) {
        user.setPassword(req.body.password, function(err) {
          if(err) {
            req.flash("error", err.message);
          }
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

    // login updated user
    req.logIn(user, function(err) {
      if(err) {
        req.flash("error", err.message);
        return res.redirect("back");
      }
    });

    if(req.fileValidationError) {
      req.flash("error", "Sorry, only .jpg, .jpeg, and .png files are allowed.");
      return res.redirect("back");
    }

    req.flash("success", "Profile successfully updated!");
    res.redirect("/users/" + user._id);

    }
  });
});

// DESTROY route -- remove user
router.delete("/:user_id", middleware.checkUserOwnership, function(req, res) {

  User.findById(req.params.user_id, async function(err, user) {
    if(err) {
      req.flash("error", err.message);
      return res.redirect("/users");
    }
    try {
      await cloudinary.v2.uploader.destroy(user.avatarId);
      user.remove();
      req.flash("success", "Profile successfully removed.")
      res.redirect("/users");
    } catch(err) {
      req.flash("error", err.message);
      return res.redirect("/users");
    }
  });
});

module.exports = router;