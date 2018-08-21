let express = require("express");
let router = express.Router();
let Campground = require("../models/campground");
let User = require("../models/user");

// show search results
router.get("/", function(req, res) {
  // paginate search results
  let perPage = 4;
  let pageQuery = parseInt(req.query.page);
  let pageNumber = pageQuery ? pageQuery : 1;
  let noMatch = null;
  let userSearch = req.query.search;
  let regex = new RegExp(escapeRegex(userSearch), "gi");

  // search campground names and usernames
  Campground.find({name: regex}).skip((perPage * pageNumber) - perPage).limit(perPage).exec(function(err, allCampgrounds) {

    User.find({username: regex}).skip((perPage * pageNumber) - perPage).limit(perPage).exec(function(err, allUsers) {

      User.count({username: regex}).exec(function(err, count) {
        if(err) {
          req.flash("error", err.message);
          res.redirect("back");
        }

        Campground.count({name: regex}).exec(function(err, count) {
          if(err) {
            req.flash("error", err.message);
            res.redirect("back");
          } else {
            if(allCampgrounds.length < 1 && allUsers.length < 1) {
              req.flash("error", "Sorry, \"" + userSearch + "\" yields no matches. Please try a different search.");
              return res.redirect("back");
            }
            res.render("searchResults", {
              path: "searchResults",
              noMatch: noMatch,
              campgrounds: allCampgrounds,
              users: allUsers,
              current: pageNumber,
              pages: Math.ceil(count / perPage),
              search: userSearch
            });
          }
        });
      });
    });
  });
});

// function for fuzzy search using regex
function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
};

module.exports = router;