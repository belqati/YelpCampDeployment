// load models
let Campground = require("../models/campground");
let Comment = require("../models/comment");
let User = require("../models/user")

// object for all middleware
let middlewareObj = {};

// session authentication and authorization for user
middlewareObj.checkUserOwnership = function(req, res, next) {
  // is a user logged in?
  if(req.isAuthenticated()) {
    User.findById(req.params.user_id, function(err, foundUser) {
      // check if err OR foundUser is null
      // must handle null or null will pass and crash the application (null.author etc. does not exist)
      if(err || !foundUser) {
        req.flash("error", "User not found!");
        res.redirect("back");
      } else {
        // is this user the author of this profile, or are they admin?
        // N.B.: foundUser._id and user._id are not the same data type, one is a string and the other an object, thus we use built in mongoose .equals method
        if(foundUser._id.equals(req.user._id) || req.user.isAdmin) {
          next();
        } else {
          req.flash("error", "You do not have permission to do that.")
          res.redirect("back");
        }
      }
    });
  } else {
    req.flash("error", "First login or create an account.");
    res.redirect("back");
  }
}

// session auth and authorization for campground
middlewareObj.checkCampgroundOwnership = function(req, res, next) {
  if(req.isAuthenticated()) {
    Campground.findById(req.params.id, function(err, foundCampground) {
      if(err || !foundCampground) {
        req.flash("error", "Campground not found!");
        res.redirect("back");
      } else {
        if(foundCampground.author.id.equals(req.user._id) || req.user.isAdmin) {
          next();
        } else {
          req.flash("error", "You do not have permission to do that.")
          res.redirect("back");
        }
      }
    });
  } else {
    req.flash("error", "First login or create an account.");
    res.redirect("back");
  }
}

// session auth and authorization for comment
middlewareObj.checkCommentOwnership = function(req, res, next) {
  if(req.isAuthenticated()) {
    Comment.findById(req.params.comment_id, function(err, foundComment) {
      if(err || !foundComment) {
        req.flash("error", "Comment does not exist!");
        res.redirect("back");
      } else {
        if(foundComment.author.id.equals(req.user._id) || req.user.isAdmin) {
          next();
        } else {
          req.flash("error", "You do not have permission to do that.")
          res.redirect("back");
        }
      }
    });
  } else {
    req.flash("error", "First login or create an account.");
    res.redirect("back");
  }
}

// general session auth
middlewareObj.isLoggedIn = function(req, res, next) {
  if(req.isAuthenticated()) {
    return next();
  }
  req.flash("error", "First login or create an account.");
  res.redirect("/login");
}

module.exports = middlewareObj;