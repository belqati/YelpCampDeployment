let express = require("express");
let router = express.Router({mergeParams: true});
let User = require("../models/user");
let Campground = require("../models/campground");
// N.B.: index.js is a file name that is automatically loaded by express, so only its directory is required
let middleware = require("../middleware");

// INDEX route -- show all users
router.get("/", function(req, res) {
  // GET all users from DB
  User.find({}, function(err, itemObj) {
    if(err) {
      req.flash("error", "Oops, something went wrong!");
      console.log(err);
    } else {
      res.render("users/index", {users: itemObj});
    }
  });
});

// NEW and CREATE routes for new users are handled as auth routes in routes/index.js

// SHOW route -- shows all info for a specific user
router.get("/:user_id", function(req, res) {
  // res.render("users/show");
  // find user via MongoDB id, populate comments array from comments collection
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
router.put("/:user_id", middleware.checkUserOwnership, function(req, res) {
  // res.send("This is the UPDATE user route!");
  User.findByIdAndUpdate(req.params.user_id, req.body.user, function(err, updatedUser) {
    if(err) {
      req.flash("error", err.message);
      res.redirect("back");
    } else {
      req.flash("success", "Your profile was successfully updated!")
      res.redirect("/users/" + req.params.user_id);
    }
  });
});

// DESTROY route -- remove specific user
router.delete("/:user_id", middleware.checkUserOwnership, function(req, res) {
  // res.send("This is the DESTROY user route!");
  User.findByIdAndRemove(req.params.user_id, function(err) {
    if(err) {
      res.redirect("/users");
    } else {
      res.redirect("/users");
    }
  });
});

module.exports = router;