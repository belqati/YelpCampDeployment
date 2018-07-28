let express = require("express");
// must merge campground and comment obj, or comment will not see campground ._id
let router = express.Router({mergeParams: true});
let Campground = require("../models/campground");
let Comment = require("../models/comment");
// N.B.: index.js is a file name that is automatically loaded by express, so only its directory is required
let middleware = require("../middleware");

// NESTED NEW ROUTE: comments form for campgrounds/:id
// middleware: require login to add comment for both GET and POST
router.get("/new", middleware.isLoggedIn, function(req, res) {
  // new comments connected to specific campground by ID
  Campground.findById(req.params.id, function(err, campgroundObj) {
    if(err) {
      console.log(err);
    } else {
      // new comments form for user input
      res.render("comments/new", {campground: campgroundObj});
    }
  });
});

// NESTED CREATE ROUTE: comments created, and redirect to SHOW route
router.post("/", middleware.isLoggedIn, function(req, res) {
  Campground.findById(req.params.id, function(err, campgroundObj) {
    if(err) {
      console.log(err);
      res.redirect("/campgrounds");
    } else {
      Comment.create(req.body.comment, function(err, commentObj) {
        if(err) {
          req.flash("error", "Oops, something went wrong!");
          console.log(err);
        } else {
          // add username and id to comment, save
          commentObj.author.id = req.user._id;
          commentObj.author.username = req.user.username;
          commentObj.save();
          // comments added and saved to comments collection
          campgroundObj.comments.push(commentObj);
          campgroundObj.save();
          console.log(commentObj);
          req.flash("success", "Comment successfully added!");
          // redirect to SHOW page
          res.redirect("/campgrounds/" + campgroundObj._id);
        }
      });
    }
  });
});

// NESTED EDIT ROUTE
router.get("/:comment_id/edit", middleware.checkCommentOwnership, function(req, res) {
  Campground.findById(req.params.id, function(err, foundCampground) {
    if(err || !foundCampground) {
      req.flash("error", "No campground to comment!");
      return res.redirect("back");
    }
    Comment.findById(req.params.comment_id, function(err, foundComment) {
      if(err) {
        res.redirect("back");
      } else {
        res.render("comments/edit", {campground_id: req.params.id, comment: foundComment});
      }
    });
  });
});

// NESTED UPDATE ROUTE
router.put("/:comment_id", middleware.checkCommentOwnership, function(req, res) {
  Comment.findByIdAndUpdate(req.params.comment_id, req.body.comment, function(err, updatedComment) {
    if(err) {
      res.redirect("back");
    } else {
      res.redirect("/campgrounds/" + req.params.id);
    }
  });
});

// NESTED DESTROY ROUTE
router.delete("/:comment_id", middleware.checkCommentOwnership, function(req, res) {
  Comment.findByIdAndRemove(req.params.comment_id, function(err) {
    if(err) {
      res.redirect("back");
    } else {
      req.flash("success", "Comment removed!");
      res.redirect("/campgrounds/" + req.params.id);
    }
  });
});

module.exports = router;