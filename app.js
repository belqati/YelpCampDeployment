// use package dotenv for hiding and loading persisting environment variables located in .env file in root project dir
// create .gitignore file with .env and /node_modules saved inside so when project uploaded to gitHub neither the .env file nor the modules dir are accidentially uploaded
// contains geocoder api key without restrictions, thus hidden on server side; a second key is used for api url in show.ejs page that is restricted since anyone can see it--WHEN DEPLOYING FINAL VERSION MUST ADJUST RESTRICTIONS...
require("dotenv").config();

let express = require("express");
let app = express();
let bodyParser = require("body-parser");
let mongoose = require("mongoose");
let passport = require("passport");
let LocalStrategy = require("passport-local");
let methodOverride = require("method-override");
// for flashing messages to user during interaction, handled in appropriate routes and ejs templates
let flash = require("connect-flash");

// load module models
let Campground = require("./models/campground");
let Comment = require("./models/comment");
let User = require("./models/user");

// load module routes
let commentRoutes = require("./routes/comments");
let campgroundRoutes = require("./routes/campgrounds");
let indexRoutes = require("./routes/index");
let userRoutes = require("./routes/users");
let searchResults = require("./routes/search");

// config server and DB
mongoose.connect("mongodb://localhost/yelpCamp");
app.use(bodyParser.urlencoded({extended: true}));
app.set("view engine", "ejs");
app.use(express.static(__dirname + "/public"));
app.use(methodOverride("_method"));
// flash must be used with session, and config before it
app.use(flash());

// let seedDB = require("./seeds");
// seedDB(); // run function to populate DB for initial testing

// load "moment", used to track when users add/edit stuff
app.locals.moment = require("moment");

// config session and passport
app.use(require("express-session")({
  secret: "purplePandas love camping!",
  resave: false,
  saveUninitialized: false
}))
app.use(passport.initialize());
app.use(passport.session());
// implement local strategy, authenticate via passport-mongoose enabled User model
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// app.use() passes the function as middleware for all routes: if no user is logged in, req.user = undefined, else it is an obj w/ username and _id
// saves us from adding {currentUser: req.user}, etc., to ALL routes manually
app.use(function(req, res, next) {
  // to access user id everywhere
  res.locals.currentUser = req.user;
  // show flash message everywhere
  res.locals.error = req.flash("error");
  res.locals.success = req.flash("success");
  next();
});

// use loaded routes, refactored to DRY up each route
app.use("/", indexRoutes);
app.use("/campgrounds", campgroundRoutes);
app.use("/campgrounds/:id/comments", commentRoutes);
app.use("/users", userRoutes);
app.use("/searchResults", searchResults);

app.listen(3000, function() {
  console.log("YelpCamp Server has started!");
});