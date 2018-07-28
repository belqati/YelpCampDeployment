// load models
let Campground = require("../models/campground");
let Comment = require("../models/comment");
let User = require("../models/user")
// all middleware for project placed within middlewareObj
// could also have placed them {inside} or module.exports = {}
let middlewareObj = {};

// middleware for session auth and authorization
middlewareObj.checkUserOwnership = function(req, res, next) {
  // is a user logged in?
  if(req.isAuthenticated()) {
    User.findById(req.params.user_id, function(err, foundUser) {
      // check if err OR foundUser is null
      // must handle null or it will pass and then crash the application, because null.author etc. does not exist
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
    req.flash("error", "Login or create an account to do that!");
    res.redirect("back");
  }
}

// middleware for session auth and authorization
middlewareObj.checkCampgroundOwnership = function(req, res, next) {
  // is a user logged in?
  if(req.isAuthenticated()) {
    Campground.findById(req.params.id, function(err, foundCampground) {
      // check if err OR foundCampground is null (so also for comment)
      // must handle null or it will pass and crash the application, because null.author etc. does not exist
      if(err || !foundCampground) {
        req.flash("error", "Campground not found!");
        res.redirect("back");
      } else {
        // is this user the author of this campground, or are they admin?
        // N.B.: _id and user._id are not the same data type, one is a string and the other an object, thus we use built in mongoose .equals method
        if(foundCampground.author.id.equals(req.user._id) || req.user.isAdmin) {
          next();
        } else {
          req.flash("error", "You do not have permission to do that.")
          res.redirect("back");
        }
      }
    });
  } else {
    req.flash("error", "Login or create an account to do that!");
    res.redirect("back");
  }
}

// middleware for session auth and authorization
middlewareObj.checkCommentOwnership = function(req, res, next) {
  // is a user logged in?
  if(req.isAuthenticated()) {
    Comment.findById(req.params.comment_id, function(err, foundComment) {
      if(err || !foundComment) {
        req.flash("error", "Comment does not exist!");
        res.redirect("back");
      } else {
        // is this user the author of this comment, or are they admin?
        // N.B.: author.id and user._id are not the same data type, one is an object and the other a string, thus we use built in mongoose .equals method
        if(foundComment.author.id.equals(req.user._id) || req.user.isAdmin) {
          next();
        } else {
          req.flash("error", "You do not have permission to do that.")
          res.redirect("back");
        }
      }
    });
  } else {
    req.flash("error", "Login or create an account to do that!");
    res.redirect("back");
  }
}

// middleware for session auth
middlewareObj.isLoggedIn = function(req, res, next) {
  if(req.isAuthenticated()) {
    return next();
  }
  // flash messaging must appear before redirect
  req.flash("error", "Login or create an account to do that!");
  res.redirect("/login");
}

module.exports = middlewareObj;