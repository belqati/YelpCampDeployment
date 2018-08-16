let express = require("express");
// merge campground and comment obj: comment then incorporates campground ._id
let router = express.Router({mergeParams: true});
let Campground = require("../models/campground");
let Comment = require("../models/comment");
let middleware = require("../middleware");

// NESTED NEW ROUTE: comments form for campgrounds/:id
router.get("/new", middleware.isLoggedIn, function(req, res) {
  // new comments connected to campground by ID
  Campground.findById(req.params.id, function(err, campgroundObj) {
    if(err) {
      req.flash("error", "Many apologies, comment app unavailable.")
      return res.redirect("back");
    } else {
      // new comments form for user input
      res.render("comments/new", {campground: campgroundObj});
    }
  });
});

// NESTED CREATE ROUTE: create comment
router.post("/", middleware.isLoggedIn, function(req, res) {
  Campground.findById(req.params.id, function(err, campgroundObj) {
    if(err) {
      req.flash("error", "Hmmm, something went wrong.")
      return res.redirect("/campgrounds");
    } else {
      Comment.create(req.body.comment, function(err, commentObj) {
        if(err) {
          req.flash("error", "Oops, comment not created!");
          return res.redirect("back");
        }
        // add id, username, and avatar to comment
        commentObj.author.id = req.user._id;
        commentObj.author.username = req.user.username;
        commentObj.author.avatar = req.user.avatar;
        commentObj.save();

        // add comments to comments collection
        campgroundObj.comments.push(commentObj);
        campgroundObj.save();

        req.flash("success", "Comment successfully added!");
        res.redirect("/campgrounds/" + campgroundObj._id);
      });
    }
  });
});

// NESTED EDIT ROUTE: edit comment form
router.get("/:comment_id/edit", middleware.checkCommentOwnership, function(req, res) {
  Campground.findById(req.params.id, function(err, foundCampground) {
    if(err || !foundCampground) {
      req.flash("error", "No campground to comment!");
      return res.redirect("back");
    }
    Comment.findById(req.params.comment_id, function(err, foundComment) {
      if(err) {
        req.flash("error", "Sorry, editing comments is unavailable.")
        return res.redirect("back");
      }
      res.render("comments/edit", {campground_id: req.params.id, comment: foundComment});
    });
  });
});

// NESTED UPDATE ROUTE: update comment
router.put("/:comment_id", middleware.checkCommentOwnership, function(req, res) {
  Comment.findByIdAndUpdate(req.params.comment_id, req.body.comment, function(err, updatedComment) {
    if(err) {
      req.flash("error", "Oops, comment update failed!")
      return res.redirect("back");
    }
    req.flash("success", "comment successfully updated!")
    res.redirect("/campgrounds/" + req.params.id);
  });
});

// NESTED DESTROY ROUTE: remove comment
router.delete("/:comment_id", middleware.checkCommentOwnership, function(req, res) {
  Comment.findByIdAndRemove(req.params.comment_id, function(err) {
    if(err) {
      req.flash("error", "Yikes, comment not destroyed!")
      return res.redirect("back");
    }
    req.flash("success", "Comment removed!");
    res.redirect("/campgrounds/" + req.params.id);
  });
});

module.exports = router;