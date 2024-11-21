var express = require("express");
const { stringify } = require("flatted");
const bodyParser = require("body-parser");
var router = express.Router();
const OpenAI = require("openai");
const https = require("https");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const Users = require("../models/Users");
const jwt = require("jsonwebtoken");
const JWT_SECRET = "your_secret_key"; // This should be stored securely and not hardcoded in production
const TOKEN_EXPIRATION = "1h"; // Token expires in 1 hour
const bcrypt = require("bcryptjs");
const SkillSets = require("../models/SkillSets");
const Periods = require("../models/Periods");
const TemplateCategories = require("../models/TemplateCategories");
const Templates = require("../models/Templates");
const Projects = require("../models/Projects");
const BiddingPrice = require("../models/Biddingprice");
const Payments = require("../models/Payments");
const { exec } = require("child_process");
const moment = require("moment");
const mongoose = require("mongoose");
const Biddingprice = require("../models/Biddingprice");
const filePath = path.join(__dirname, "exported_data.json");
const crypto = require('crypto'); // Import the crypto module for password generation


const allSkills = fs.existsSync(filePath)
  ? JSON.parse(fs.readFileSync(filePath, "utf-8"))
  : [];

const adminInfoMiddleware = (req, res, next) => {
  if (req.session.user) {
    // If admin session exists, store admin email and phone in session
    res.locals.username = req.session.user.username;
    res.locals.adminEmail = req.session.user.adminEmail;
    res.locals.adminPhone = req.session.user.adminPhone;
    res.locals.adminSkype = req.session.user.adminSkype;
    res.locals.adminTelegram = req.session.user.adminTelegram;
  }
  next();
};

const sessionChecker = (req, res, next) => {
  // Check if session exists
  if (req.session && req.session.user) {
    console.log("req session user exist--->");
    const subscriptionEndDate = moment(req.session.user.subscriptionEndDate);
    const currentTime = moment();
    console.log("here is user lock status", req.session.user.isLocked);
    // Check if the user is logged in and not locked
    if (req.session.user.isLocked === false) {
      console.log("req session user isLocked false--->");
      if (subscriptionEndDate.isAfter(currentTime)) {
        console.log("user has ongoing subscription------>");
        // Set user information in res.locals for use in other middleware or routes
        res.locals.user = req.session.user;
        // Session exists and user is not locked, continue to the next middleware/route handler
        next();
      } else {
        // User is locked, redirect to a different page (or return an error)
        res.redirect("/myBidsBlock");
      }
    } else {
      // User is locked, redirect to a different page (or return an error)
      res.redirect("/locked");
    }
  } else {
    // Session doesn't exist or user is not logged in, redirect to the login page
    res.redirect("/login");
  }
};
const isAdmin = (req, res, next) => {
  // Check if user is logged in and isAdmin is true
  if (req.session.admin && req.session.admin.isAdmin) {
    res.locals.user = req.session.admin;
    // User is an admin, proceed to the next middleware or route handler
    next();
  } else {
    // User is not an admin, redirect to login page or display an error
    req.flash(
      "error",
      "Access denied. You must be an admin to access this page."
    );
    res.redirect("/login"); // Redirect to login page
  }
};

function isLoggedIn(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.status(401).send("You are not logged in");
  }
}

function isNotLoggedIn(req, res, next) {
  if (!req.session.user) {
    next();
  } else {
    res.status(401).send("You are already logged in");
    res.redirect("/myBids");
  }
}
router.use(adminInfoMiddleware);
/* GET home page. */
router.get("/", async function (req, res, next) {
  const payments = await Payments.find();
  console.log("payments : ", payments[0]);
  res.render("index", { title: "Express", payments });
});

router.get("/dashboard", sessionChecker, function (req, res, next) {
  res.redirect("/myBids");
});

router.get("/settings", sessionChecker, function (req, res, next) {
  res.render("settings", { title: "Express" });
});

router.get("/login", function (req, res, next) {
  res.render("login", {
    title: "Express",
    error: req.flash("error" || undefined),
  });
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  // console.log("here is user password---->",password)
  try {
    const user = await Users.findOne({ username: username });
    console.log("here is user", user);
    if (!user) {
      console.log("no user");
      req.flash("error", "No user found.");
      res.redirect("/login");
      return;
    }

    // Compare hashed password
    const isMatch = await bcrypt.compare(password, user.password);
    console.log("checking matched");
    if (!isMatch) {
      console.log("no match");
      req.flash("error", "Invalid credentials.");
      res.redirect("/login");
      return;
    }

    console.log("match");
    console.log("makinsession");
    if (user.isAdmin) {
      // Create admin object

      const admin = {
        _id: user._id,
        id: user.id,
        username: user.username,
        location: user.location,
        primary_currency: user.primary_currency,
        primary_language: user.primary_language,
        timezone: user.timezone,
        email: user.email,
        phone: user.phone,
        role: user.role,
        tokenExpirationDate: user.tokenExpirationDate,
        access_token: user.access_token,
        refresh_token: user.refresh_token,
        skills: user.skills,
        excluded_skills: user.excluded_skills,
        excluded_countries: user.excluded_countries,
        bidsAllow: user.bidsAllow,
        trial: user.trial,
        autoBid: user.autoBid,
        timeInterval: user.timeInterval,
        timeLimit: user.timeLimit,
        bidsLimit: user.bidsLimit,
        subscriptionType: user.subscriptionType,
        subscriptionStartDate: user.subscriptionStartDate,
        subscriptionEndDate: user.subscriptionEndDate,
        isLocked: user.isLocked,
        password: user.password,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        isAdmin: true,
        // Add any other admin-specific properties if needed
      };

      // Save admin session
      req.session.admin = admin;
      (req.session.adminEmail = user.email),
        (req.session.adminPhone = user.phone),
        (req.session.adminSkype = user.skype),
        (req.session.adminTelegram = user.telegram),
        console.log("Admin session created");
      req.flash("success", "Login successful!");
      return res.redirect("/admin/dashboard");
    }
    const adminUser = await Users.findOne({ isAdmin: true });
    // If passwords match, save user session
    req.session.user = {
      ...user,
      adminEmail: adminUser.email,
      adminPhone: adminUser.phone,
      adminSkype: adminUser.skype,
      adminTelegram: adminUser.telegram,
    };
    const sanitizedUser = {
      ...user._doc, // Assuming user is your existing user object
      adminEmail: adminUser.email,
      adminPhone: adminUser.phone,
      adminSkype: adminUser.skype,
      adminTelegram: adminUser.telegram,
    };

    // Remove specific properties if needed
    delete sanitizedUser.$__;
    delete sanitizedUser.$isNew;

    // Assign the sanitized user to the session
    req.session.user = sanitizedUser;
    console.log("user session is", req.session.user);

    req.flash("success", "Login successful!");

    return res.redirect("/myBids");
  } catch (error) {
    console.log("error");
    req.flash("error", "Server error occurred.");
    res.redirect("/login");
  }
});

router.get("/signup", async function (req, res, next) {
  const payments = await Payments.find();
  console.log("payments------>",payments)
  res.render("signup", { payments:payments[0],title: "Express" });
});

router.get("/create-password/:token", function (req, res, next) {
  res.render("create-password", {
    token: req.params.token,
    messages: req.flash("error"),
  });
});

router.post("/create-password", async function (req, res, next) {
  const { token, password, confirmPassword,email,phoneNo } = req.body;

  // Step 1: Verify the token
  try {
    const decoded = jwt.verify(token, JWT_SECRET); // Ensure JWT_SECRET is safely stored and accessed
    const userId = decoded.userId;

    // Step 2: Validate the passwords
    if (!email || !phoneNo) {
      req.flash("error", "Enter credentials ");
      return res.redirect("/create-password/" + token);
    }
    // Step 2: Validate the passwords
    if (password !== confirmPassword) {
      req.flash("error", "Passwords do not match");
      return res.redirect("/create-password/" + token);
    }

    // Step 3: Hash the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Step 4: Update the User model
    const user = await Users.findById(userId);
    if (user.isAdmin == false) {
      const adminUser = await Users.findOne({ isAdmin: true });
      // If passwords match, save user session
      req.session.user = {
        ...user,
        adminEmail: adminUser.email,
        adminPhone: adminUser.phone,
        adminSkype: adminUser.skype,
        adminTelegram: adminUser.telegram,
      };
      const sanitizedUser = {
        ...user._doc, // Assuming user is your existing user object
        adminEmail: adminUser.email,
        adminPhone: adminUser.phone,
        adminSkype: adminUser.skype,
        adminTelegram: adminUser.telegram,
      };

      // Remove specific properties if needed
      delete sanitizedUser.$__;
      delete sanitizedUser.$isNew;

      // Assign the sanitized user to the session
      req.session.user = sanitizedUser;
    }

    if (!user) {
      req.flash("error", "User not found");
      return res.redirect("/create-password/" + token);
    }
    user.email=email
    user.phone=phoneNo
    user.password = hashedPassword;
    await user.save();
    delete user.password;
    // req.session.user = user;
    res.locals.adminEmail = req.session.user.adminEmail;
    res.locals.adminPhone = req.session.user.adminPhone;
    res.locals.adminSkype = req.session.user.adminSkype;
    res.locals.adminTelegram = req.session.user.adminTelegram;

    res.locals.username = req.session.user.username;

    req.flash("success", "Password has been set successfully.");
    res.redirect("/myBids");
  } catch (error) {
    console.log("here,", error);
    req.flash("error", "Invalid or expired token.");
    res.redirect("/create-password/" + token);
  }
});

// Helper function to generate a random state parameter
function generateRandomState() {
  return Math.random().toString(36).substring(7);
}

// Users who hit this endpoint will be redirected to the authorization prompt
router.get("/authorize", (req, res) => {
  const state = generateRandomState();
  const oauthUri = "https://accounts.freelancer.com/oauth/authorize";
  const clientId = process.env.clientId;
  const redirectUri = process.env.redirectUri;

  const prompt = "select_account consent";
  const advancedScopes = "1 2 3 6";
  const authorizationUrl = `${oauthUri}?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=basic&prompt=${prompt}&advanced_scopes=${advancedScopes}&state=${state}`;
  res.redirect(authorizationUrl);
});

router.get("/freelancer/callback", async (req, res) => {
  console.log("here 3");
  let code = req.query.code;
  const clientSecret = process.env.clientSecret;
  const clientId = process.env.clientId;
  const redirectUri = process.env.redirectUri;
  const url = "https://accounts.freelancer.com/oauth/token";

  const payload = `grant_type=authorization_code&code=${code}&client_id=${clientId}&client_secret=${clientSecret}&redirect_uri=${redirectUri}`;
  console.log("here 4", code);
  const headers = { "Content-Type": "application/x-www-form-urlencoded" };

  try {
    console.log("here 5");
    let response = await axios.post(url, payload, { headers });

    console.log("here 5", response.data);

    let data = await getSelfData(response.data);
    console.log("here is data=====> : ", data.user.username);

    let checkUser = await Users.findOne({ username: data.user.username });
    if (checkUser && checkUser.password) {
      return res.render("alreadyRegistered");
    }
    if (data.status) {
      req.session.user = {
        id: data.user._id,
        username: data.user.username,
      };
      console.log("1111111111");
      // req.session.user = data.user
      res.redirect(`/create-password/${data.token}`);
    } else {
      console.log("2");
      req.flash("error", "Error Occured. Try again later.");
      res.redirect("/login");
    }
  } catch (error) {
    req.flash("error", "Error Occured. Try again later.");
    console.log(error);
    res.redirect("/login");
  }
});

const getSelfData = async (data) => {
  console.log("here in getSelfData function");
  const url =
    "https://freelancer.com/api/users/0.1/self?preferred_details=true";
  const url2 = "https://freelancer.com/api/users/0.1/self?jobs=true";
  console.log(
    "here in getSelfData function after url and printing data: ",
    data
  );

  const headers = { "freelancer-oauth-v1": data.access_token };

  try {
    let response = await axios.get(url, { headers });
    let response2 = await axios.get(url2, { headers });

    if ((response.data.status = "success")) {
      console.log("s1:", response);
      console.log("s1 for jobs:", response2);
      const expiresIn = data.expires_in; // token expires in seconds
      const currentDate = new Date();
      const expirationDate = new Date(currentDate.getTime() + expiresIn * 1000);
      console.log("here is user", response.data.result.username);
      const existingUser = await Users.findOne({
        username: response.data.result.username,
      });
      if (existingUser) {
        console.log("User found : ", existingUser);
        const jobs = response2.data.result.jobs;
        
        // Extract job names from the jobs array
        const jobNames = jobs.map((job) => String(job.name));
        let skills = [...jobNames];
        existingUser.skills = skills;
        existingUser.access_token = data.access_token;
        existingUser.refresh_token = data.refresh_token;
        existingUser.tokenExpirationDate = expirationDate;
        
        if (response2.data.result.avatar_cdn || response2.data.result.avatar_large_cdn) {
          existingUser.profilePicture = response2.data.result.avatar_cdn || response2.data.result.avatar_large_cdn;
        }
        // Save the updated user to the database
        await existingUser.save();
        console.log("User information updated: ", existingUser);
      }
      if (!existingUser) {
        const currentDate = new Date().toISOString(); // Get current date in UTC ISO string format
        const subscriptionEndDate = new Date();
        subscriptionEndDate.setDate(subscriptionEndDate.getDate() + 3); // Adding 15 days to the current date
        const jobs = response2.data.result.jobs;
        const pp=response2.data.result.avatar_cdn || response2.data.result.avatar_large_cdn
        // Extract job names from the jobs array
        const jobNames = jobs.map((job) => String(job.name));
        let skills = [...jobNames];
        console.log("skills which are gotton from jobs: ", skills);
        const allStrings = skills.every((skill) => typeof skill === "string");

        // Check if the skills array itself is an array of strings
        const isArrayString =
          Array.isArray(skills) &&
          skills.every((skill) => typeof skill === "string");

        console.log("Are all elements strings?", allStrings);
        console.log("Is the array itself an array of strings?", isArrayString);
        // let skills = [
        //   "API",
        //   "Database Development",
        //   "Express JS",
        //   "Flutter",
        //   "Full Stack Development",
        //   "HTML",
        //   "HTML5",
        //   "JavaScript",
        //   "Laravel",
        //   "MongoDB",
        //   "MySQL",
        //   "Next.js",
        //   "Node.js",
        //   "PHP",
        //   "React Native",
        //   "React.js",
        //   "Software Development",
        //   "Typescript",
        //   "Web Development",
        //   "Website Development",
        // ];
        console.log(response.data);
        let userr = new Users({
          ...response.data.result,
          skills,
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          tokenExpirationDate: expirationDate,
          role: "freelancer",
          trial: true,
          bidsAllow: 10,
          autoBid: false,
          timeInterval: 1,
          timeLimit: 1,
          bidsLimit: 1,
          higher_bid_range: 100,
          lower_bid_range: 100,
          subscriptionType: "trial",
          isAdmin: false,
          isLocked: false,
          subscriptionStartDate: currentDate,
          subscriptionEndDate: subscriptionEndDate.toISOString(),
        });
        if(pp){
          userr.profilePicture = pp

        }
        let savedUser = await userr.save();

        // req.session.user = {
        //   id: savedUser._id,
        //   username: savedUser.username,
        // };
        const defaultRecords = [
          {
            name: "Greetings",
            always_include: true,
            position: 1,
            user: savedUser._id,
          },
          {
            name: "Introduction",
            always_include: true,
            position: 2,
            user: savedUser._id,
          },
          {
            name: "Skills",
            always_include: true,
            position: 3,
            user: savedUser._id,
          },
          {
            name: "Portfolio",
            always_include: true,
            position: 4,
            user: savedUser._id,
          },
          {
            name: "Closing line",
            always_include: true,
            position: 5,
            user: savedUser._id,
          },
          {
            name: "Signature",
            always_include: true,
            position: 6,
            user: savedUser._id,
          },
          // Add more default records as needed
        ];
        try {
          for (const record of defaultRecords) {
            const templateCategory = new TemplateCategories(record);
            await templateCategory.save();
            console.log("Template category saved:", templateCategory);
          }
        } catch (error) {
          // Handle error if saving default records fails
          console.error("Error saving default records:", error);
        }
        try {
          const skillSet = new SkillSets({
            name: "All",
            skills: skills, // Add skill IDs here if available, otherwise leave empty for now
            user: savedUser._id,
          });
          await skillSet.save();
          console.log("SkillSets record saved:", skillSet);
        } catch (error) {
          // Handle error if saving SkillSets record fails
          console.error("Error saving SkillSets record:", error);
        }

        // Now, fetch the saved skill sets to get their IDs
        const savedSkillSet = await SkillSets.findOne({
          name: "All",
          user: savedUser._id,
        });
        console.log("savedSkillSet------>", savedSkillSet);
        // Use the fetched skill set ID in defaultRecordsTemplates

        let defaultCategories = await TemplateCategories.find({
          user: savedUser._id,
        });

        const defaultRecordsTemplates = [
          {
            content: "Hello {{Owner Name}} , ",
            skills: savedSkillSet.skills,
            category: defaultCategories.find(
              (category) => category.name === "Greetings"
            )?._id,
            userId: savedUser._id,
          },
          {
            content:
              "We went through your project description and it seems like our team is a great fit for this job.",
            skills: savedSkillSet.skills,
            category: defaultCategories.find(
              (category) => category.name === "Introduction"
            )?._id,
            userId: savedUser._id,
          },
          {
            content:
              "We would like to grab this opportunity and will work till you get 100% satisfied with our work.",
            skills: savedSkillSet.skills,
            category: defaultCategories.find(
              (category) => category.name === "Introduction"
            )?._id,
            userId: savedUser._id,
          },
          {
            content:
              "We are an expert team which have many years of experience on Job Skills.",
            skills: savedSkillSet.skills,
            category: defaultCategories.find(
              (category) => category.name === "Skills"
            )?._id,
            userId: savedUser._id,
          },
          {
            content: "Lets connect in chat so that We discuss further.",
            skills: savedSkillSet.skills,
            category: defaultCategories.find(
              (category) => category.name === "Closing line"
            )?._id,
            userId: savedUser._id,
          },
          {
            content:
              "Please come over chat and discuss your requirement in a detailed way.",
            skills: savedSkillSet.skills,
            category: defaultCategories.find(
              (category) => category.name === "Closing line"
            )?._id,
            userId: savedUser._id,
          },
          {
            content: "Regards",
            skills: savedSkillSet.skills,
            category: defaultCategories.find(
              (category) => category.name === "Signature"
            )?._id,
            userId: savedUser._id,
          },
          {
            content: "Thank You",
            skills: savedSkillSet.skills,
            category: defaultCategories.find(
              (category) => category.name === "Signature"
            )?._id,
            userId: savedUser._id,
          },
        ];
        try {
          for (const record of defaultRecordsTemplates) {
            await Templates.create(record);
          }
          console.log("Default templates saved successfully.");
        } catch (error) {
          // Handle error if saving default templates fails
          console.error("Error saving default templates:", error);
        }
      }
      console.log("s2");

      let user = await Users.findOne({ id: response.data.result.id });
      console.log("s3", user);

      const token = jwt.sign(
        {
          userId: user._id,
        },
        JWT_SECRET,
        { expiresIn: TOKEN_EXPIRATION }
      );
      return { status: true, user, token };
    } else {
      console.log("s4");
      return { status: false, user: undefined };
    }
  } catch (error) {
    return { status: false, user: undefined };
  }
};

// router.get("/myBids", sessionChecker, async (req, res) => {
//   // const url = "https://www.freelancer-sandbox.com/api/users/0.1/self/jobs/";
//   // let id = req.session.user._id;
//   // let user = await Users.findOne({ _id: id });
//   // // let accessToken = user.access_token;
//   // let accessToken = "UnkxqQ39gqRWYAUZWVmspVZiK0UbqY";
//   // console.log("accessToken--->",accessToken)
//   // const headers = { "freelancer-oauth-v1": accessToken };
//   // let userSkills = req.session.user.skills;
//   // const userSkillsWithValue = userSkills
//   //   .map((skill) => {
//   //     const matchedSkill = allSkills.find((s) => s.tag === skill);
//   //     return matchedSkill ? { skill, value: matchedSkill.value } : null;
//   //   })
//   //   .filter(Boolean);
//   // const userSkillValues = userSkillsWithValue.map((skill) => skill.value);

//   // const params = {
//   //   jobs: userSkillValues,
//   // };

//   // try {
//   //   const response = await axios.post(url, {
//   //     params: params,
//   //     headers: headers,
//   //   });
//   //   console.log("here is response data from jobs----->", response.data.request_id);
//   //   const reqId=response.data.request_id;
//   //   req.session.request_id=reqId
//   // } catch (error) {
//   //   // Handle errors
//   //   console.error("Error fetching data:", error);
//   //   res.status(500).send("An error occurred while fetching data.");
//   // }
//   let userId=req.session.user._id
//   let user=await Users.findById(userId);
//   if (user) {
//     let userAutoBid = user.autoBid ? "ON" : "Off";
//     console.log("User AutoBidding is: ", userAutoBid);
//     res.render("myBids", { userAutoBid });
//   } else {
//     console.log("User not found");
//     // Handle this case accordingly
//   }
// } catch ((err) {
//   console.error("Error finding user:", err);
//   // Handle error
// });
// //   const url = 'https://www.freelancer-sandbox.com/api/users/0.1/self/jobs/';

// // // Assuming you have already retrieved the access token, user ID, and user skills
// // const id = req.session.user._id;
// // const user = await Users.findOne({ _id: id });
// // const accessToken = user.access_token;
// // const userSkills = req.session.user.skills;

// // // Assuming allSkills is available and contains skill values
// // const userSkillsWithValue = userSkills.map((skill) => {
// //   const matchedSkill = allSkills.find((s) => s.tag === skill);
// //   return matchedSkill ? { skill, value: matchedSkill.value } : null;
// // }).filter(Boolean);

// // const userSkillValues =  userSkillsWithValue
// // .map((skill) => parseInt(skill.value))
// // .slice(0, 9); // Limits to the first 20 elements
// //   console.log("heree are skills------>",userSkillValues)
// // const headers = {
// //   'Content-Type': 'application/json',
// //   'freelancer-oauth-v1': accessToken
// // };

// // fetch(url, {
// //   method: 'POST',
// //   headers: headers,
// //   body: JSON.stringify({ "jobs[]": userSkillValues })
// // })
// //   .then(response => response.json())
// //   .then(data => {

// //     console.log('Response:', data);
// //   })
// //   .catch(error => {
// //     console.error('Error:', error);
// //   });
// });
async function getProjectsCountForUserLast7Days(userId) {
  const today = new Date();
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000); // Subtract 7 days in milliseconds

  console.log("Today:", today.toISOString().split("T")[0]);
  console.log("Seven days ago:", sevenDaysAgo.toISOString().split("T")[0]);

  try {
    const projectCounts = [];

    for (let i = 0; i < 7; i++) {
      const startDate = new Date(
        today.getTime() - (i + 1) * 24 * 60 * 60 * 1000
      ); // Subtract i days from today
      const endDate = new Date(today.getTime() - i * 24 * 60 * 60 * 1000); // Subtract i-1 days from today

      const projects = await Projects.find({
        time: { $gte: startDate, $lt: endDate },
        user: userId,
      });

      const formattedDate = startDate.toISOString().split("T")[0];
      const count = projects.length;

      projectCounts.push({ _id: formattedDate, count });
    }

    console.log("Project counts:", projectCounts);

    return projectCounts;
  } catch (error) {
    console.error("Error fetching project counts:", error);
    throw error;
  }
}

// Function to fill missing dates with zero counts
function fillMissingDates(projectCounts, startDate, endDate) {
  const result = [];
  let currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const formattedDate = currentDate.toISOString().split("T")[0];
    const existingEntry = projectCounts.find(
      (entry) => entry._id === formattedDate
    );
    if (existingEntry) {
      result.push(existingEntry);
    } else {
      result.push({ _id: formattedDate, count: 0 });
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return result;
}

router.get("/myBidsBlock", async (req, res) => {
  const pricing = await Payments.find({});

  res.render("myBidsBlock", { pricing });
});

router.get("/myBids", sessionChecker, async (req, res) => {
  try {
    let userId = req.session.user._id;

    let user = await Users.findById(userId);
    console.log("here is user : ", user);
    let timeInterval=user.timeInterval;
    const pricing = await Payments.find({});
    if (user) {
      let userAutoBid = user.autoBid ? "ON" : "Off";
      console.log("User AutoBidding is: ", userAutoBid);
      let data = await getProjectsCountForUserLast7Days(userId);
      console.log("data--->", data);
      console.log("user id : ",userId)
      let project = await Projects.find({ user: user._id });
  

     
      let projectCount = project.length;
      let failedProjectsCount = project.filter(project => project.status === 1).length;
      let successfulProjectsCount = project.filter(project => project.status != 1).length;
      let allowedBids = projectCount;
      console.log("allowedBids--->", allowedBids);
      console.log("user project counts ",projectCount)
      console.log("user failedProjectsCount counts ",failedProjectsCount)
      console.log("user successfulProjectsCount counts ",successfulProjectsCount)
      res.render("myBids", { pricing, userAutoBid, data, allowedBids,failedProjectsCount,successfulProjectsCount,timeInterval});
    } else {
      console.log("User not found");
      // Handle this case accordingly
    }
  } catch (err) {
    console.error("Error finding user:", err);
    // Handle error
  }
});
router.get("/autoBidTurnOn", sessionChecker, async (req, res) => {
  try {
    const userId = req.session.user._id;
    const user = await Users.findById(userId);
    // Get the autoBid value from query parameters
    const userAutoBid = req.query.autoBid;
    const redirectUrl = req.query.redirect || "/myBids";
    // Update user's autoBid status based on the query parameter
    if (userAutoBid === "ON") {
      user.autoBid = true;
    } else {
      user.autoBid = false;
      user.bidStartTime = null;
      user.bidEndTime = null;
      user.breakTime = null;
      
    }

    // Save the updated user object
    await user.save();

    // Log the updated autoBid status
    console.log("User AutoBidding:", user.autoBid);

    // Further logic based on the user's autoBid status
    console.log("123: ",redirectUrl)
    res.redirect(redirectUrl);
  } catch (err) {
    console.error("Error updating autoBid status:", err);
    // Handle error
    res.status(500).send("Error updating autoBid status");
  }
});
router.get("/autoBidTurnOnTimeSetting", sessionChecker, async (req, res) => {
  try {
    const userId = req.session.user._id;
    const user = await Users.findById(userId);
    // Get the autoBid value from query parameters
    const userAutoBid = req.query.autoBid;

    // Update user's autoBid status based on the query parameter
    if (userAutoBid === "ON") {
      user.autoBid = true;
    } else {
      user.autoBid = false;
      user.bidStartTime="";
      user.bidEndTime="";
      user.breakTime="";
    }

    // Save the updated user object
    await user.save();

    // Log the updated autoBid status
    console.log("User AutoBidding:", user.autoBid);

    // Further logic based on the user's autoBid status

    res.redirect("/timeSetting");
  } catch (err) {
    console.error("Error updating autoBid status:", err);
    // Handle error
    res.status(500).send("Error updating autoBid status");
  }
});
function isIntervalHit(pastDate, timeInterval) {
  // Convert pastDate to a Date object
  const pastDateTime = new Date(pastDate);

  // Calculate the future date by adding the time interval (in milliseconds)
  const futureDateTime = new Date(
    pastDateTime.getTime() + timeInterval * 60000
  ); // Convert minutes to milliseconds

  // Get the current date and time
  // const currentDateTime = new Date();

  // Check if the future date is less than the current date
  return futureDateTime > pastDateTime;
}

// router.get("/test" ,async (req, res) => {
//   try {
//     const usersWithAutoBidOn = await Users.find({ autoBid: true });
//     const usersWithAutoBidOnIds = usersWithAutoBidOn.map((user) => user._id);

//     for (let i = 0; i < usersWithAutoBidOnIds.length; i++) {
//       console.log("Current user index:", i);
//       // Get user ID from session
//       const userId = usersWithAutoBidOnIds[i];

//       // Fetch user details using the user ID
//       let user = await Users.findById(userId);

//       // Extract access token from user details
//       let accessToken = user.access_token;

//       // Extract excluded skills and excluded countries from user details
//       let excludedSkills = user.excluded_skills;
//       let excludedCountries = user.excluded_countries;
//       let clientPaymentVerified = user.payment_verified;
//       let clientEmailVerified = user.email_verified;
//       let clientDepositMade = user.deposit_made;
//       let minimumBudgetFix = parseInt(user.minimum_budget_fixed);
//       let minimumBudgetHourly = parseInt(user.minimum_budget_hourly);

//       // Construct headers with access token
//       const headers = { "freelancer-oauth-v1": accessToken };

//       let bidsAllowed = user.bidsAllow;
//       console.log("bits allowed are", bidsAllowed);

//       while (bidsAllowed > 0) {
//         // API endpoint for fetching projects
//         const url =
//           "https://freelancer-sandbox.com/api/projects/0.1/projects/all/";

//         // Parameters for the API request
//         const params = {
//           min_avg_price: 10,
//           project_statuses: ["active"],
//           full_description: true,
//           job_details: true,
//           user_details: true,
//           location_details: true,
//           user_status: true,
//           user_reputation: true,
//           user_country_details: true,
//           user_display_info: true,
//           user_membership_details: true,
//           user_financial_details: true,
//           compact: true,
//         };

//         // Make request to fetch projects
//         const response = await axios.get(url, {
//           params: params,
//           headers: headers,
//         });

//         // Process response data
//         const responseData = response.data;
//         const projects = responseData.result.projects;

//         // Extract user details for project owners
//         const ownerIds = projects.map((project) => project.owner_id);
//         const projectsDetails = await Promise.all(
//           ownerIds.map(async (ownerId) => {
//             if (!isNaN(ownerId)) {
//               const ownerUrl = `https://freelancer-sandbox.com/api/users/0.1/users/${ownerId}/`;
//               const ownerResponse = await axios.get(ownerUrl, {
//                 jobs: true,
//                 reputation: true,
//                 employer_reputation: true,
//                 reputation_extra: true,
//                 employer_reputation_extra: true,
//                 job_ranks: true,
//                 staff_details: true,
//                 completed_user_relevant_job_count: true,
//                 headers: headers,
//               });
//               return ownerResponse.data.result;
//             } else {
//               return null;
//             }
//           })
//         );

//         // Render projects
//         const projects2 = responseData.result.projects.map(
//           (project, index) => ({
//             projectid: project.id,
//             type: project.type,
//             description: project.description,
//             title: project.title,
//             currencyName: project.currency.name,
//             currencySign: project.currency.sign,
//             bidCount: project.bid_stats.bid_count,
//             bidAverage: project.bid_stats.bid_avg,
//             jobNames: project.jobs.map((job) => job.name),
//             minimumBudget: project.budget.minimum,
//             maximumBudget: project.budget.maximum,
//             country: project.location.country.flag_url,
//             fullName: projectsDetails[index]?.username,
//             displayName: projectsDetails[index]?.public_name,
//             ownerCountry: projectsDetails[index]?.location?.country?.name,
//             payment: projectsDetails[index]?.status?.payment_verified,
//             email: projectsDetails[index]?.status?.email_verified,
//             deposit_made: projectsDetails[index]?.status?.deposit_made,
//             identity_verified:
//               projectsDetails[index]?.status?.identity_verified,
//             countryShortName: projectsDetails[index]?.timezone?.country,
//           })
//         );

//         const filteredProjects2 = projects2.filter((project) => {
//           // Convert project's countryShortName to lowercase for case-insensitive comparison
//           const projectCountry = project.countryShortName
//             ? project.countryShortName.toLowerCase()
//             : "";

//           // Check if project's countryShortName matches any excluded country (case-insensitive)
//           if (
//             excludedCountries.some(
//               (country) => country.toLowerCase() === projectCountry
//             )
//           ) {
//             return false; // Exclude project
//           }

//           // Check if project's jobNames include any excluded skill (case-insensitive)
//           if (
//             project.jobNames.some((skill) =>
//               excludedSkills.includes(skill.toLowerCase())
//             )
//           ) {
//             return false; // Exclude project
//           }
//           console.log("this is project type---->", project.type);

//           console.log(
//             "this is project minimum budgete---->",
//             project.minimumBudget
//           );
//           console.log("this is user minimum budgete---->", minimumBudgetFix);
//           // Check if clientPaymentVerified is 'yes'
//           if (clientPaymentVerified == "yes" && project.payment == null) {
//             return false; // Exclude project
//           }

//           // Check if clientEmailVerified is 'yes'
//           if (clientEmailVerified == "yes" && project.email !== true) {
//             return false; // Include project
//           }

//           // Check if clientDepositMade is 'yes'
//           if (clientDepositMade == "yes" && project.deposit_made == null) {
//             return false; // Exclude project
//           }

//           // Additional filters based on project type (fixed or hourly)
//           if (
//             project.type == "fixed" &&
//             project.minimumBudget <= minimumBudgetFix
//           ) {
//             console.log(
//               "heree----->" +
//                 project.type +
//                 " project inimum budget " +
//                 project.minimumBudget +
//                 " minimum budget " +
//                 minimumBudgetFix
//             );
//             return false; // Exclude project
//           }

//           if (
//             project.type == "hourly" &&
//             project.minimumBudget <= minimumBudgetHourly
//           ) {
//             return false; // Exclude project
//           }

//           return true; // Include project
//         });
//         // console.log("here is filteredProjects2 --------->", filteredProjects2)
//         console.log("after filter--->", filteredProjects2);
//         console.log("length after filter--->", filteredProjects2.length);
//         const description =
//           "Hello {{ownerName}} , \n" +
//           "We would like to grab this opportunity and will work till you get 100% satisfied with our work.\n" +
//           "We are an expert team which has many years of experience in Job Skills.\n" +
//           "Please come over chat and discuss your requirement in a detailed way.\n" +
//           "Thank You";

//         const filteredProjectDetails = filteredProjects2.map((project) => {
//           const ownerName = project.fullName || project.displayName || "";
//           return {
//             projectid: project.projectid,
//             bidAverage: project.bidAverage,
//             minimumBudget: project.minimumBudget,
//             maximumBudget: project.maximumBudget,
//             fullName: project.fullName,
//             displayName: project.displayName,
//             jobNames: project.jobNames,
//             description:
//               `Hello ${ownerName ? ownerName : "there"}, \n` +
//               "We would like to grab this opportunity and will work till you get 100% satisfied with our work.\n" +
//               "We are an expert team with many years of experience in Job Skills.\n" +
//               "Please come over chat and discuss your requirements in detail.\n" +
//               "Thank You",
//           };
//         });
//         const numBids = Math.min(
//           filteredProjectDetails.length,
//           bidsAllowed,
//           user.bidsLimit
//         );
//         console.log("number of bids it will make---->", numBids);
//         const currentTime = new Date();
//         const timeLimitInMinutes = user.timeLimit;

//         // Add the time limit in minutes to the current time
//         const newTime = new Date(
//           currentTime.getTime() + timeLimitInMinutes * 60000
//         );

//         let whenToStop = new Date(user.bidEndTime).getTime();
//         let latestTime = Date.now();
//         function printDates(timestamp1, timestamp2) {
//           // Convert timestamps to Date objects
//           const date1 = new Date(timestamp1);
//           const date2 = new Date(timestamp2);

//           // Print dates
//           console.log("Date 1:", date1.toLocaleString());
//           console.log("Date 2:", date2.toLocaleString());
//       }
//       printDates(whenToStop, latestTime);
//         if (latestTime < whenToStop) {
//           if (isIntervalHit(user.bidStartTime, user.timeInterval)) {
//             const project = filteredProjectDetails[i];

//             // Extract project details
//             const {
//               projectid,
//               minimumBudget,
//               maximumBudget,
//               description,
//               bidAverage,
//             } = project;
//             let averageBid = parseInt(bidAverage);
//             let lowRange = parseInt(user.lower_bid_range);
//             let highRange = parseInt(user.higher_bid_range);
//             const lowerValue = averageBid * (lowRange / 100);
//             const higherValue = averageBid * (highRange / 100);
//             console.log("Average Bid:", averageBid);
//             console.log("Low Range:", lowRange);
//             console.log("High Range:", highRange);
//             console.log("here is user value------>", higherValue);
//             console.log("here is user value------>", lowerValue);
//             let smallValue = averageBid - lowerValue;
//             let largeValue = averageBid + higherValue;
//             let randomValue = parseFloat(
//               (smallValue + Math.random() * (largeValue - smallValue)).toFixed(
//                 2
//               )
//             );
//             console.log("Random Value:---->", randomValue);
//             console.log("here is high value------>", smallValue);
//             console.log("here is randomValue------>", randomValue);
//             // Calculate the bid amount (between minimumBudget and maximumBudget)

//             let bidderid = parseInt(user.id);
//             let projectID = parseInt(projectid);
//             let bidMoney = parseFloat(randomValue);
//             if (isNaN(bidMoney) || lowRange == 0 || highRange == 0) {
//               bidMoney = parseFloat(averageBid);
//             }
//             // console.log("Amount:", amount);
//             console.log("Bidder ID:", bidderid);
//             console.log("Project ID:", projectID);
//             console.log("Bid Money:", bidMoney);
//             // Prepare the bid request body
//             const bidRequestBody = {
//               project_id: projectID,
//               bidder_id: bidderid,
//               amount: bidMoney,
//               period: 3,
//               milestone_percentage: 50,
//               description: description,
//             };

//             try {
//               // Make the POST request to Freelancer API
//               const response = await fetch(
//                 `https://www.freelancer-sandbox.com/api/projects/0.1/bids/`,
//                 {
//                   method: "POST",
//                   headers: {
//                     "Content-Type": "application/json",
//                     "freelancer-oauth-v1": accessToken,
//                   },
//                   body: JSON.stringify(bidRequestBody),
//                 }
//               );

//               // Parse the JSON response
//               const responseData = await response.json();

//               // Log response
//               console.log("Bid Response:", responseData);

//               if (responseData.status !== "error") {
//                 // Decrease bidsAllowed by 1 for the user if bid was successful
//                 bidsAllowed--;
//                 await Users.updateOne(
//                   { _id: userId },
//                   { $set: { bidsAllow: bidsAllowed } }
//                 );
//               }
//             } catch (error) {
//               console.error("Error occurred while sending bid:", error);
//               // Handle error if needed
//             }
//           } else {
//             console.log("function isIntervalHit function gave false value");
//           }
//         } else {
//           console.log(
//             "latestTime Was greater then When to stop. when to stop was " +
//               whenToStop +
//               " and latest time was " +
//               latestTime
//           );
//         }

//         let updatingStartTime = await Users.findOneAndUpdate(
//           { _id: user._id },
//           { $set: { bidStartTime: currentTime, bidEndTime: newTime } }, // Update operation to set the `bidStartTime` field
//           // Update operation to set the `bidStartTime` field
//           { new: true } // Option to return the updated document
//         );

//       }
//       console.log("Moving to the next user...");
//       i++;}
//       res.status(200).send("Processing complete for all users with autoBid on");
//   } catch (error) {
//     console.error("Error occurred:", error);
//     return res.status(500).json({ error: "Internal Server Error" });
//   }
// });
// router.get("/test", sessionChecker, async (req, res) => {

//   try {
//     const usersWithAutoBidOn = await Users.find({ autoBid: true });
//     const usersWithAutoBidOnIds = usersWithAutoBidOn.map(user => user._id);

//     for (let i = 0; i < usersWithAutoBidOnIds.length; i++) {
//     // Get user ID from session
//     const userId = usersWithAutoBidOnIds[i];

//     // Fetch user details using the user ID
//     let user = await Users.findById(userId);

//     // Extract access token from user details
//     let accessToken = user.access_token;

//     // Extract excluded skills and excluded countries from user details
//     let excludedSkills = user.excluded_skills;
//     let excludedCountries = user.excluded_countries;
//     let clientPaymentVerified = user.payment_verified;
//     let clientEmailVerified = user.email_verified;
//     let clientDepositMade = user.deposit_made;
//     let minimumBudgetFix = parseInt(user.minimum_budget_fixed);
//     let minimumBudgetHourly =parseInt(user.minimum_budget_hourly);

//     // Construct headers with access token
//     const headers = { "freelancer-oauth-v1": accessToken };

//     let bidsAllowed = user.bidsAllow;
//     console.log("bits allowed are", bidsAllowed);

//     while (bidsAllowed > 0) {
//       // API endpoint for fetching projects
//       const url = 'https://freelancer-sandbox.com/api/projects/0.1/projects/all/';

//       // Parameters for the API request
//       const params = {
//         min_avg_price: 10,
//         project_statuses: ["active"],
//         full_description: true,
//         job_details: true,
//         user_details: true,
//         location_details: true,
//         user_status: true,
//         user_reputation: true,
//         user_country_details: true,
//         user_display_info: true,
//         user_membership_details: true,
//         user_financial_details: true,
//         compact: true,
//       };

//       // Make request to fetch projects
//       const response = await axios.get(url, {
//         params: params,
//         headers: headers,
//       });

//       // Process response data
//       const responseData = response.data;
//       const projects = responseData.result.projects;

//       // Extract user details for project owners
//       const ownerIds = projects.map(project => project.owner_id);
//       const projectsDetails = await Promise.all(ownerIds.map(async ownerId => {
//         if (!isNaN(ownerId)) {
//           const ownerUrl = `https://freelancer-sandbox.com/api/users/0.1/users/${ownerId}/`;
//           const ownerResponse = await axios.get(ownerUrl, {
//             jobs: true,
//             reputation: true,
//             employer_reputation: true,
//             reputation_extra: true,
//             employer_reputation_extra: true,
//             job_ranks: true,
//             staff_details: true,
//             completed_user_relevant_job_count: true,
//             headers: headers,
//           });
//           return ownerResponse.data.result;
//         } else {
//           return null;
//         }
//       }));

//       // Render projects
//       const projects2 = responseData.result.projects.map((project, index) => ({
//         projectid: project.id,
//         type: project.type,
//         description: project.description,
//         title: project.title,
//         currencyName: project.currency.name,
//         currencySign: project.currency.sign,
//         bidCount: project.bid_stats.bid_count,
//         bidAverage: project.bid_stats.bid_avg,
//         jobNames: project.jobs.map(job => job.name),
//         minimumBudget: project.budget.minimum,
//         maximumBudget: project.budget.maximum,
//         country: project.location.country.flag_url,
//         fullName: projectsDetails[index]?.username,
//         displayName: projectsDetails[index]?.public_name,
//         ownerCountry: projectsDetails[index]?.location?.country?.name,
//         payment: projectsDetails[index]?.status?.payment_verified,
//         email: projectsDetails[index]?.status?.email_verified,
//         deposit_made: projectsDetails[index]?.status?.deposit_made,
//         identity_verified: projectsDetails[index]?.status?.identity_verified,
//         countryShortName: projectsDetails[index]?.timezone?.country,
//       }));

//       const filteredProjects2 = projects2.filter(project => {
//         // Convert project's countryShortName to lowercase for case-insensitive comparison
//         const projectCountry = project.countryShortName ? project.countryShortName.toLowerCase() : '';

//         // Check if project's countryShortName matches any excluded country (case-insensitive)
//         if (excludedCountries.some(country => country.toLowerCase() === projectCountry)) {
//             return false; // Exclude project
//         }

//         // Check if project's jobNames include any excluded skill (case-insensitive)
//         if (project.jobNames.some(skill => excludedSkills.includes(skill.toLowerCase()))) {
//             return false; // Exclude project
//         }
//         console.log("this is project type---->",project.type)

//         console.log("this is project minimum budgete---->",project.minimumBudget)
//         console.log("this is user minimum budgete---->",minimumBudgetFix)
//         // Check if clientPaymentVerified is 'yes'
//         if (clientPaymentVerified == 'yes' && project.payment == null) {
//             return false; // Exclude project
//         }

//         // Check if clientEmailVerified is 'yes'
//     if (clientEmailVerified == 'yes' && project.email !== true) {
//       return false; // Include project
//   }

//         // Check if clientDepositMade is 'yes'
//         if (clientDepositMade == 'yes' && project.deposit_made == null) {
//             return false; // Exclude project
//         }

//         // Additional filters based on project type (fixed or hourly)
//         if (project.type == 'fixed' && project.minimumBudget <= minimumBudgetFix) {
//           console.log("heree----->"+project.type+" project inimum budget "+project.minimumBudget+" minimum budget "+minimumBudgetFix)
//             return false; // Exclude project
//         }

//         if (project.type == 'hourly' && project.minimumBudget <= minimumBudgetHourly) {
//             return false; // Exclude project
//         }

//         return true; // Include project
//     });
//       // console.log("here is filteredProjects2 --------->", filteredProjects2)
//     console.log("after filter--->",filteredProjects2)
//     console.log("length after filter--->",filteredProjects2.length)
//       const description = 'Hello {{ownerName}} , \n' +
//         'We would like to grab this opportunity and will work till you get 100% satisfied with our work.\n' +
//         'We are an expert team which has many years of experience in Job Skills.\n' +
//         'Please come over chat and discuss your requirement in a detailed way.\n' +
//         'Thank You';

//       const filteredProjectDetails = filteredProjects2.map(project => {
//         const ownerName = project.fullName || project.displayName || '';
//         return {
//           projectid: project.projectid,
//           bidAverage: project.bidAverage,
//           minimumBudget: project.minimumBudget,
//           maximumBudget: project.maximumBudget,
//           fullName: project.fullName,
//           displayName: project.displayName,
//           jobNames: project.jobNames,
//           description: `Hello ${ownerName ? ownerName : 'there'}, \n` +
//             'We would like to grab this opportunity and will work till you get 100% satisfied with our work.\n' +
//             'We are an expert team with many years of experience in Job Skills.\n' +
//             'Please come over chat and discuss your requirements in detail.\n' +
//             'Thank You'
//         };
//       });
//       const numBids = Math.min(filteredProjectDetails.length, bidsAllowed,user.bidsLimit);
//       console.log("number of bids it will make---->",numBids)
//       const currentTime = new Date();
//       const timeLimitInMinutes = user.timeLimit;

// // Add the time limit in minutes to the current time
// const newTime = new Date(currentTime.getTime() + timeLimitInMinutes * 60000);
//       let updatingStartTime= await Users.findOneAndUpdate(
//         { _id: user._id },
//         { $set: { bidStartTime: currentTime, bidEndTime:newTime } }, // Update operation to set the `bidStartTime` field
//          // Update operation to set the `bidStartTime` field
//         { new: true } // Option to return the updated document
//       );
//       let whenToStop=new Date(user.bidEndTime).getTime()
//       let latestTime = new Date().getTime();
//       for (let i = 0; i < numBids; i++) {
//     //     console.log("here==--->",i)
//     //     console.log(latestTime)
//     //     console.log(whenToStop)
//     //      if (latestTime >= whenToStop) {
//     //     break; // Exit the loop if it's time to stop
//     // }
//         setTimeout(async () => {
//         const project = filteredProjectDetails[i];

//         // Extract project details
//         const { projectid, minimumBudget, maximumBudget, description,bidAverage } = project;
//         let averageBid=parseInt(bidAverage);
//         let lowRange=parseInt(user.lower_bid_range);
//         let highRange=parseInt(user.higher_bid_range);
//         const lowerValue = averageBid * (lowRange / 100);
//       const higherValue = averageBid * (highRange / 100);
//               console.log("Average Bid:", averageBid);
//         console.log("Low Range:", lowRange);
//         console.log("High Range:", highRange);
//         console.log("here is user value------>",higherValue)
//         console.log("here is user value------>",lowerValue)
//         let smallValue= (averageBid -lowerValue);
//         let largeValue= (averageBid +higherValue);
//         let randomValue = parseFloat((smallValue + Math.random() * (largeValue - smallValue)).toFixed(2));
//         console.log("Random Value:---->", randomValue);
//         console.log("here is high value------>",smallValue)
//         console.log("here is randomValue------>",randomValue)
//         // Calculate the bid amount (between minimumBudget and maximumBudget)
//         let amount = (minimumBudget + maximumBudget) / 2;
//         let bidderid = parseInt(user.id);
//         let projectID = parseInt(projectid);
//         let bidMoney = parseFloat(randomValue);
//                     if (isNaN(bidMoney)||lowRange == 0 || highRange == 0) {
//                       bidMoney = parseFloat(averageBid);
//                     }
//         console.log("Amount:", amount);
//         console.log("Bidder ID:", bidderid);
//         console.log("Project ID:", projectID);
//         console.log("Bid Money:", bidMoney);
//         // Prepare the bid request body
//         const bidRequestBody = {
//           "project_id": projectID,
//           "bidder_id": bidderid,
//           "amount": bidMoney,
//           "period": 3,
//           "milestone_percentage": 50,
//           "description": description,
//         };

//         try {
//           // Make the POST request to Freelancer API
//           const response = await fetch(`https://www.freelancer-sandbox.com/api/projects/0.1/bids/`, {
//             method: "POST",
//             headers: {
//               "Content-Type": "application/json",
//               "freelancer-oauth-v1": accessToken,
//             },
//             body: JSON.stringify(bidRequestBody),
//           });

//           // Parse the JSON response
//           const responseData = await response.json();

//           // Log response
//           console.log("Bid Response:", responseData);

//           if (responseData.status !== 'error') {
//             // Decrease bidsAllowed by 1 for the user if bid was successful
//             bidsAllowed--;
//             await Users.updateOne({ _id: userId }, { $set: { bidsAllow: bidsAllowed } });
//           }
//         } catch (error) {
//           console.error("Error occurred while sending bid:", error);
//           // Handle error if needed
//         } }, i * (user.timeInterval * 60));
//       }

//       // Output the filtered project details
//       // console.log("Filtered Project Details:---------->", filteredProjectDetails);
//       return res.status(200).json(filteredProjects2.slice(0, numBids));
//     }
//   }
//   res.status(200).send("Processing complete for all users with autoBid on");
//   } catch (error) {
//     console.error("Error occurred:", error);
//     return res.status(500).json({ error: "Internal Server Error" });
//   }
// });

router.get("/test2", sessionChecker, async (req, res) => {
  try {
    // Get user ID from session
    const userId = req.session.user._id;

    // Fetch user details using the user ID
    let user = await Users.findById(userId);

    // Extract access token from user details
    let accessToken = user.access_token;

    // Extract excluded skills and excluded countries from user details
    let excludedSkills = user.excluded_skills;
    let excludedCountries = user.excluded_countries;
    let clientPaymentVerified = user.payment_verified;
    let clientEmailVerified = user.email_verified;
    let clientDepositMade = user.deposit_made;
    let minimumBudgetFix = parseInt(user.minimum_budget_fixed);
    let minimumBudgetHourly = parseInt(user.minimum_budget_hourly);

    // Construct headers with access token
    const headers = { "freelancer-oauth-v1": accessToken };

    let bidsAllowed = user.bidsAllow;
    console.log("bits allowed are", bidsAllowed);

    while (bidsAllowed > 0) {
      // API endpoint for fetching projects
      const url = "https://freelancer.com/api/projects/0.1/projects/all/";

      // Parameters for the API request
      const params = {
        min_avg_price: 10,
        project_statuses: ["active"],
        full_description: true,
        job_details: true,
        user_details: true,
        location_details: true,
        user_status: true,
        user_reputation: true,
        user_country_details: true,
        user_display_info: true,
        user_membership_details: true,
        user_financial_details: true,
        compact: true,
      };

      // Make request to fetch projects
      const response = await axios.get(url, {
        params: params,
        headers: headers,
      });

      // Process response data
      const responseData = response.data;
      const projects = responseData.result.projects;

      // Extract user details for project owners
      const ownerIds = projects.map((project) => project.owner_id);
      const projectsDetails = await Promise.all(
        ownerIds.map(async (ownerId) => {
          if (!isNaN(ownerId)) {
            const ownerUrl = `https://freelancer.com/api/users/0.1/users/${ownerId}/`;
            const ownerResponse = await axios.get(ownerUrl, {
              jobs: true,
              reputation: true,
              employer_reputation: true,
              reputation_extra: true,
              employer_reputation_extra: true,
              job_ranks: true,
              staff_details: true,
              completed_user_relevant_job_count: true,
              headers: headers,
            });
            return ownerResponse.data.result;
          } else {
            return null;
          }
        })
      );

      // Render projects
      const projects2 = responseData.result.projects.map((project, index) => ({
        projectid: project.id,
        type: project.type,
        description: project.description,
        title: project.title,
        currencyName: project.currency.name,
        currencySign: project.currency.sign,
        bidCount: project.bid_stats.bid_count,
        bidAverage: project.bid_stats.bid_avg,
        jobNames: project.jobs.map((job) => job.name),
        minimumBudget: project.budget.minimum,
        maximumBudget: project.budget.maximum,
        country: project.location.country.flag_url,
        fullName: projectsDetails[index]?.username,
        displayName: projectsDetails[index]?.public_name,
        ownerCountry: projectsDetails[index]?.location?.country?.name,
        payment: projectsDetails[index]?.status?.payment_verified,
        email: projectsDetails[index]?.status?.email_verified,
        deposit_made: projectsDetails[index]?.status?.deposit_made,
        identity_verified: projectsDetails[index]?.status?.identity_verified,
        countryShortName: projectsDetails[index]?.timezone?.country,
      }));

      const filteredProjects2 = projects2.filter((project) => {
        // Convert project's countryShortName to lowercase for case-insensitive comparison
        const projectCountry = project.countryShortName
          ? project.countryShortName.toLowerCase()
          : "";

        // Check if project's countryShortName matches any excluded country (case-insensitive)
        if (
          excludedCountries.some(
            (country) => country.toLowerCase() === projectCountry
          )
        ) {
          return false; // Exclude project
        }

        // Check if project's jobNames include any excluded skill (case-insensitive)
        if (
          project.jobNames.some((skill) =>
            excludedSkills.includes(skill.toLowerCase())
          )
        ) {
          return false; // Exclude project
        }
        console.log("this is project type---->", project.type);

        console.log(
          "this is project minimum budgete---->",
          project.minimumBudget
        );
        console.log("this is user minimum budgete---->", minimumBudgetFix);
        // Check if clientPaymentVerified is 'yes'
        if (clientPaymentVerified == "yes" && project.payment == null) {
          return false; // Exclude project
        }

        // Check if clientEmailVerified is 'yes'
        if (clientEmailVerified == "yes" && project.email !== true) {
          return false; // Include project
        }

        // Check if clientDepositMade is 'yes'
        if (clientDepositMade == "yes" && project.deposit_made == null) {
          return false; // Exclude project
        }

        // Additional filters based on project type (fixed or hourly)
        if (
          project.type == "fixed" &&
          project.minimumBudget <= minimumBudgetFix
        ) {
          console.log(
            "heree----->" +
              project.type +
              " project inimum budget " +
              project.minimumBudget +
              " minimum budget " +
              minimumBudgetFix
          );
          return false; // Exclude project
        }

        if (
          project.type == "hourly" &&
          project.minimumBudget <= minimumBudgetHourly
        ) {
          return false; // Exclude project
        }

        return true; // Include project
      });
      // console.log("here is filteredProjects2 --------->", filteredProjects2)
      console.log("after filter--->", filteredProjects2);
      console.log("length after filter--->", filteredProjects2.length);
      const description =
        "Hello {{ownerName}} , \n" +
        "We would like to grab this opportunity and will work till you get 100% satisfied with our work.\n" +
        "We are an expert team which has many years of experience in Job Skills.\n" +
        "Please come over chat and discuss your requirement in a detailed way.\n" +
        "Thank You";

      const filteredProjectDetails = filteredProjects2.map((project) => {
        const ownerName = project.fullName || project.displayName || "";
        return {
          projectid: project.projectid,
          bidAverage: project.bidAverage,
          minimumBudget: project.minimumBudget,
          maximumBudget: project.maximumBudget,
          fullName: project.fullName,
          displayName: project.displayName,
          jobNames: project.jobNames,
          description:
            `Hello ${ownerName ? ownerName : "there"}, \n` +
            "We would like to grab this opportunity and will work till you get 100% satisfied with our work.\n" +
            "We are an expert team with many years of experience in Job Skills.\n" +
            "Please come over chat and discuss your requirements in detail.\n" +
            "Thank You",
        };
      });
      const numBids = Math.min(filteredProjectDetails.length, bidsAllowed);

      for (let i = 0; i < numBids; i++) {
        setTimeout(async () => {
          const project = filteredProjectDetails[i];
          // Extract project details
          const {
            projectid,
            minimumBudget,
            maximumBudget,
            description,
            bidAverage,
          } = project;
          let averageBid = parseInt(bidAverage);
          let lowRange = parseInt(req.session.user.lower_bid_range);
          let highRange = parseInt(req.session.user.higher_bid_range);
          const lowerValue = averageBid * (lowRange / 100);
          const higherValue = averageBid * (highRange / 100);
          console.log("Average Bid:", averageBid);
          console.log("Low Range:", lowRange);
          console.log("High Range:", highRange);
          console.log("here is user value------>", higherValue);
          console.log("here is user value------>", lowerValue);
          let smallValue = averageBid - lowerValue;
          let largeValue = averageBid + higherValue;
          let randomValue = (
            smallValue +
            Math.random() * (largeValue - smallValue)
          ).toFixed(2);
          console.log("Random Value:---->", randomValue);
          console.log("here is high value------>", smallValue);
          console.log("here is randomValue------>", randomValue);
          // Calculate the bid amount (between minimumBudget and maximumBudget)
          let amount = (minimumBudget + maximumBudget) / 2;
          let bidderid = parseInt(req.session.user.id);
          let projectID = parseInt(projectid);
          let bidMoney = parseFloat(randomValue);
          // Prepare the bid request body
          const bidRequestBody = {
            project_id: projectID,
            bidder_id: bidderid,
            amount: bidMoney,
            period: 3,
            milestone_percentage: 50,
            description: description,
          };

          try {
            // Make the POST request to Freelancer API
            const response = await fetch(
              `https://www.freelancer.com/api/projects/0.1/bids/`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "freelancer-oauth-v1": accessToken,
                },
                body: JSON.stringify(bidRequestBody),
              }
            );

            // Parse the JSON response
            const responseData = await response.json();

            // Log response
            console.log("Bid Response:", responseData);

            if (responseData.status !== "error") {
              // Decrease bidsAllowed by 1 for the user if bid was successful
              bidsAllowed--;
              await Users.updateOne(
                { _id: userId },
                { $set: { bidsAllow: bidsAllowed } }
              );
            }
          } catch (error) {
            console.error("Error occurred while sending bid:", error);
            // Handle error if needed
          }
        }, i * 70000);
      }

      // Output the filtered project details
      // console.log("Filtered Project Details:---------->", filteredProjectDetails);
      return res.status(200).json(filteredProjects2.slice(0, numBids));
    }
  } catch (error) {
    console.error("Error occurred:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
// router.get("/test2", sessionChecker, async (req, res) => {
//   try {
//     // Get user ID from session
//     const userId = req.session.user._id;

//     // Fetch user details using the user ID
//     const user = await Users.findById(userId);

//     // Extract user details
//     const {
//       access_token: accessToken,
//       excluded_skills: excludedSkills,
//       excluded_countries: excludedCountries,
//       payment_verified: clientPaymentVerified,
//       email_verified: clientEmailVerified,
//       deposit_made: clientDepositMade,
//       minimum_budget_fixed: minimumBudgetFix,
//       minimum_budget_hourly: minimumBudgetHourly,
//       bidsAllow: bidsAllowed
//     } = user;

//     console.log("bits allowed are", bidsAllowed);

//     // Check if there are available bids
//     if (bidsAllowed <= 0) {
//       return res.status(400).json({ error: "No available bids" });
//     }
//     let iteration = 0;
//     // Loop until all bids are exhausted
//     while (bidsAllowed > 0) {
//       // Fetch projects from Freelancer API
//       const projects = await fetchProjects(accessToken);

//       // Filter projects based on user preferences
//       const filteredProjects = filterProjects(projects, excludedSkills, excludedCountries, clientPaymentVerified, clientEmailVerified, clientDepositMade, minimumBudgetFix, minimumBudgetHourly);

//       console.log("Filtered projects:", filteredProjects);

//       // Get the number of bids to be made
//       const numBids = Math.min(filteredProjects.length, bidsAllowed);

//       // Make bids with a delay of 70 seconds for each iteration
//       for (let i = 0; i < numBids; i++) {
//         iteration++;
//         await makeBid(req, filteredProjects[i], accessToken, userId);
//         await delay(70000);
//       }

//       // Update bidsAllowed after making bids
//       await updateBidsAllowed(userId, bidsAllowed - numBids);

//       return res.status(200).json({ message: "Bids placed successfully" });
//     }
//   } catch (error) {
//     console.error("Error occurred:", error);
//     return res.status(500).json({ error: "Internal Server Error" });
//   }
// });

async function fetchProjects(accessToken) {
  const url = "https://freelancer.com/api/projects/0.1/projects/all/";
  const headers = { "freelancer-oauth-v1": accessToken };
  const params = {
    min_avg_price: 10,
    project_statuses: ["active"],
    full_description: true,
    job_details: true,
    user_details: true,
    location_details: true,
    user_status: true,
    user_reputation: true,
    user_country_details: true,
    user_display_info: true,
    user_membership_details: true,
    user_financial_details: true,
    compact: true,
  };
  const response = await axios.get(url, { params, headers });
  return response.data.result.projects;
}

function filterProjects(
  projects,
  excludedSkills,
  excludedCountries,
  clientPaymentVerified,
  clientEmailVerified,
  clientDepositMade,
  minimumBudgetFix,
  minimumBudgetHourly
) {
  return projects.filter((project) => {
    const projectCountry = project.location.country.flag_url?.toLowerCase();
    if (
      excludedCountries.some(
        (country) => country.toLowerCase() === projectCountry
      )
    ) {
      return false; // Exclude project
    }

    if (
      project.jobs.some((job) =>
        excludedSkills.includes(job.name.toLowerCase())
      )
    ) {
      return false; // Exclude project
    }

    if (clientPaymentVerified === "yes" && !project.status.payment_verified) {
      return false; // Exclude project
    }

    if (clientEmailVerified === "yes" && !project.status.email_verified) {
      return false; // Exclude project
    }

    if (clientDepositMade === "yes" && !project.status.deposit_made) {
      return false; // Exclude project
    }

    if (
      project.type === "fixed" &&
      project.budget.minimum <= minimumBudgetFix
    ) {
      return false; // Exclude project
    }

    if (
      project.type === "hourly" &&
      project.budget.minimum <= minimumBudgetHourly
    ) {
      return false; // Exclude project
    }

    return true; // Include project
  });
}

async function makeBid(req, project, accessToken, userId, iteration) {
  const { id: bidderId } = req.session.user;
  const {
    id: projectId,
    minimumBudget,
    maximumBudget,
    description,
    bid_stats: bidStats,
    jobs,
    timezone,
    owner_id,
  } = project;
  const averageBid = bidStats.bid_avg;
  const lowRange = req.session.user.lower_bid_range;
  const highRange = req.session.user.higher_bid_range;
  const lowerValue = averageBid * (lowRange / 100);
  const higherValue = averageBid * (highRange / 100);
  const smallValue = averageBid - lowerValue;
  const largeValue = averageBid + higherValue;
  const randomValue = (
    smallValue +
    Math.random() * (largeValue - smallValue)
  ).toFixed(2);
  const bidMoney = parseFloat(randomValue);

  const bidRequestBody = {
    project_id: parseInt(projectId),
    bidder_id: parseInt(bidderId),
    amount: parseFloat(bidMoney),
    period: 3,
    milestone_percentage: 50,
    description: description,
  };

  const response = await axios.post(
    `https://www.freelancer.com/api/projects/0.1/bids/`,
    bidRequestBody,
    {
      headers: {
        "Content-Type": "application/json",
        "freelancer-oauth-v1": accessToken,
      },
    }
  );

  const responseData = response.data;

  console.log("Bid Response for iteration ${iteration}:", responseData);

  if (responseData.status !== "error") {
    return await Users.updateOne({ _id: userId }, { $inc: { bidsAllow: -1 } });
  }
}

async function updateBidsAllowed(userId, newBidsAllowed) {
  return await Users.updateOne(
    { _id: userId },
    { $set: { bidsAllow: newBidsAllowed } }
  );
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

router.get("/createJob", sessionChecker, async (req, res) => {
  // const url = "https://www.freelancer-sandbox.com/api/users/0.1/self/jobs/";
  // let id = req.session.user._id;
  // let user = await Users.findOne({ _id: id });
  // // let accessToken = user.access_token;
  // let accessToken = "UnkxqQ39gqRWYAUZWVmspVZiK0UbqY";
  // console.log("accessToken--->",accessToken)
  // const headers = { "freelancer-oauth-v1": accessToken };
  // let userSkills = req.session.user.skills;
  // const userSkillsWithValue = userSkills
  //   .map((skill) => {
  //     const matchedSkill = allSkills.find((s) => s.tag === skill);
  //     return matchedSkill ? { skill, value: matchedSkill.value } : null;
  //   })
  //   .filter(Boolean);
  // const userSkillValues = userSkillsWithValue.map((skill) => skill.value);

  // const params = {
  //   jobs: userSkillValues,
  // };

  // try {
  //   const response = await axios.post(url, {
  //     params: params,
  //     headers: headers,
  //   });
  //   console.log("here is response data from jobs----->", response.data.request_id);
  //   const reqId=response.data.request_id;
  //   req.session.request_id=reqId
  //   res.render("myBids");
  // } catch (error) {
  //   // Handle errors
  //   console.error("Error fetching data:", error);
  //   res.status(500).send("An error occurred while fetching data.");
  // }
  const url = "https://www.freelancer.com/api/users/0.1/self/jobs/";

  // Assuming you have already retrieved the access token, user ID, and user skills
  const id = req.session.user._id;
  const user = await Users.findOne({ _id: id });
  const accessToken = user.access_token;
  const userSkills = req.session.user.skills;

  // Assuming allSkills is available and contains skill values
  const userSkillsWithValue = userSkills
    .map((skill) => {
      const matchedSkill = allSkills.find((s) => s.tag === skill);
      return matchedSkill ? { skill, value: matchedSkill.value } : null;
    })
    .filter(Boolean);

  const userSkillValues = userSkillsWithValue
    .map((skill) => parseInt(skill.value))
    .slice(0, 9); // Limits to the first 20 elements
  console.log("heree are skills------>", userSkillValues);
  const headers = {
    "Content-Type": "application/json",
    "freelancer-oauth-v1": accessToken,
  };

  fetch(url, {
    method: "POST",
    headers: headers,
    body: JSON.stringify({ "jobs[]": userSkillValues }),
  })
    .then((response) => response.json())
    .then((data) => {
      console.log("Response:", data);
    })
    .catch((error) => {
      console.error("Error:", error);
    });
});
// router.get("/search", sessionChecker, async (req, res) => {
//   const url = "https://freelancer.com/api/projects/0.1/projects/all";

//   let id = req.session.user._id;
//   let user = await Users.findOne({ _id: id });

//   let userAutoBid = user.autoBid ? "ON" : "Off";
//   let accessToken = user.access_token;
//   const excludedSkills = user.excluded_skills;
//   const excludedCountries = user.excluded_countries;
//   let userSkills = req.session.user.skills;

//   let userTimezone = req.session.user.timezone.timezone;
//   let userCurrencySign = req.session.user.primary_currency.sign;
//   let userCurrency = req.session.user.primary_currency.name;
//   // console.log("this is user skills---->",req.session.user.skills)
//   // console.log("this is user Timezone---->",req.session.user.timezone.timezone)
//   // console.log("this is user currency sign---->",req.session.user.primary_currency.sign)
//   // console.log("this is user currncy name---->",req.session.user.primary_currency.name)
//   const userSkillsWithValue = userSkills
//     .map((skill) => {
//       const matchedSkill = allSkills.find((s) => s.tag === skill);
//       return matchedSkill ? { skill, value: matchedSkill.value } : null;
//     })
//     .filter(Boolean);
//   const userSkillValues = userSkillsWithValue.map((skill) => Number(skill.value));

//   console.log("here are the value of user skills------>", userSkillValues);

//   const headers = { "freelancer-oauth-v1": accessToken };

//   const page = parseInt(req.query.page, 10) || 1; // Get the page number from the query parameters, default to page 1

//   const pageSize = 5; // Number of items per page

//   const params = {
//     jobs: userSkillValues,
//     min_avg_price: 10,
//     project_statuses: ["active"],
//     full_description: true,
//     job_details: true,
//     user_details: true,
//     location_details: true,
//     user_status: true,
//     user_reputation: true,
//     user_country_details: true,
//     user_display_info: true,
//     user_membership_details: true,
//     user_financial_details: true,

//     compact: true,
//     offset: (page - 1) * pageSize, // Calculate the offset based on the current page
//     limit: pageSize, // Limit the number of items per page
//   };

//   try {
//     const response = await axios.get(url, {
//       params: params,
//       headers: headers,
//     });

//     const responseData = response.data;
//     const projects = responseData.result.projects;
//     console.log("here are projects------>", projects);
//     const numProjects = projects.length;
//     console.log("here are  NO of projects------>", numProjects);
//     const ownerIds = projects.map((project) => project.owner_id);

//     // Initialize an array to store project details
//     let projectsDetails = [];

//     // Loop through ownerIds and make AJAX calls for each owner ID
//     for (let ownerId of ownerIds) {
//       if (!isNaN(ownerId)) {
//         const ownerUrl = `https://freelancer.com/api/users/0.1/users/${ownerId}/`;
//         const ownerResponse = await axios.get(
//           ownerUrl,
//           {
//             jobs: true,
//             reputation: true,
//             employer_reputation: true,
//             reputation_extra: true,
//             employer_reputation_extra: true,
//             job_ranks: true,
//             staff_details: true,
//             completed_user_relevant_job_count: true,
//           },
//           {
//             headers: headers,
//           }
//         );

//         // Push project details to the projectsDetails array
//         console.log("getting user info------", ownerResponse.data.result);
//         projectsDetails.push({
//           username: ownerResponse.data.result.username,
//           publicName: ownerResponse.data.result.public_name,
//           country: ownerResponse.data.result.location.country.name,
//           payment: ownerResponse.data.result.status.payment_verified,
//           email: ownerResponse.data.result.status.email_verified,
//           deposit_made: ownerResponse.data.result.status.deposit_made,
//           identity_verified: ownerResponse.data.result.status.identity_verified,
//           countryShortName: ownerResponse.data.result.timezone.country,
//         });
//       } else {
//         console.log("Invalid owner ID:", ownerId);
//       }
//     }

//     // Flatten the array of arrays into a single array
//     projectsDetails = projectsDetails.flat();

//     // Render projects
//     const projects3 = responseData.result.projects.map((project, index) => ({
//       projectid: project.id,
//       description: project.description,
//       title: project.title,
//       currencyName: project.currency.name,
//       currencySign: project.currency.sign,
//       bidCount: project.bid_stats.bid_count,
//       bidAverage: project.bid_stats.bid_avg,
//       jobNames: project.jobs.map((job) => job.name),
//       minimumBudget: project.budget.minimum,
//       maximumBudget: project.budget.maximum,
//       country: project.location.country.flag_url,
//       fullName: projectsDetails[index].username, // Assuming you want to include the username
//       displayName: projectsDetails[index].publicName, // Include publicName
//       ownerCountry: projectsDetails[index].country, // Include country
//       payment: projectsDetails[index].payment,
//       email: projectsDetails[index].email,
//       deposit_made: projectsDetails[index].deposit_made,
//       identity_verified: projectsDetails[index].identity_verified,
//       countryShortName: projectsDetails[index].countryShortName,
//     }));
//     const projects2 = projects3.filter((project) => {
//       // Convert project's countryShortName to lowercase for case-insensitive comparison
//       const projectCountry = project.countryShortName
//         ? project.countryShortName.toLowerCase()
//         : "";

//       // Check if project's countryShortName matches any excluded country (case-insensitive)
//       if (
//         excludedCountries.some(
//           (country) => country.toLowerCase() === projectCountry
//         )
//       ) {
//         return false; // Exclude project
//       }

//       // Check if project's jobNames include any excluded skill (case-insensitive)
//       if (
//         project.jobNames.some((skill) =>
//           excludedSkills.includes(skill.toLowerCase())
//         )
//       ) {
//         return false; // Exclude project
//       }

//       return true; // Include project
//     });

//     const totalCount = responseData.result.total_count;
//     const totalPages = Math.ceil(totalCount / pageSize);
//     projects2.forEach(project => {
//       let averageBid = parseInt(project.bidAverage);
//       let lowRange = parseInt(user.lower_bid_range);
//       let highRange = parseInt(user.higher_bid_range);

//       const lowerValue = averageBid * (lowRange / 100);
//       const higherValue = averageBid * (highRange / 100);

//       let smallValue = averageBid - lowerValue;
//       let largeValue = averageBid + higherValue;

//       let randomValue = parseFloat((smallValue + Math.random() * (largeValue - smallValue)).toFixed(2));

//       // Add the randomValue to the project object
//       project.randomValue = randomValue;
//     });
//     console.log("here is project 2 Data-------------->", projects2);
//     console.log("userSkills: ",userSkills)
//     console.log("userSkills with values : ",userSkillValues)
//     console.log("here is user : ",user)
//     console.log("here is user id from session : ",id)
//     res.render("searchCopy", {userAutoBid,user,
//       data: projects2,
//       currentPage: page,
//       totalPages: totalPages,
//     });
//   } catch (error) {
//     console.error("Error fetching data:", error);
//     res.status(500).send("Error fetching data");
//   }
// });

let lastFetchedProjectId = null; // To store the ID of the last fetched project

router.get("/search", sessionChecker, async (req, res) => {
  const url = "https://freelancer.com/api/projects/0.1/projects/all";

  try {
    let id = req.session.user._id;
    let user = await Users.findOne({ _id: id });

    if (!user) {
      return res.status(404).send("User not found");
    }

    let userAutoBid = user.autoBid ? "ON" : "OFF";
    let accessToken = user.access_token;
    const excludedSkills = user.excluded_skills.map((skill) =>
      skill.toLowerCase()
    );
    const excludedCountries = user.excluded_countries.map((country) =>
      country.toLowerCase()
    );
    let userSkills = req.session.user.skills;

    let userTimezone = req.session.user.timezone.timezone;
    let userCurrencySign = req.session.user.primary_currency.sign;
    let userCurrency = req.session.user.primary_currency.name;

    const userSkillsWithValue = userSkills
      .map((skill) => {
        const matchedSkill = allSkills.find((s) => s.tag === skill);
        return matchedSkill ? { skill, value: matchedSkill.value } : null;
      })
      .filter(Boolean);
    const userSkillValues = userSkillsWithValue.map((skill) =>
      Number(skill.value)
    );

    const headers = { "freelancer-oauth-v1": accessToken };

    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = 5;

    const params = {
      jobs: userSkillValues,
      min_avg_price: 10,
      project_statuses: ["active"],
      full_description: true,
      job_details: true,
      user_details: true,
      location_details: true,
      user_status: true,
      user_reputation: true,
      user_country_details: true,
      user_display_info: true,
      user_membership_details: true,
      user_financial_details: true,
      compact: true,
      offset: (page - 1) * pageSize,
      limit: pageSize,
    };

    const response = await axios.get(url, {
      params: params,
      headers: headers,
    });

    const responseData = response.data;
    const projects = responseData.result.projects;

    const ownerIds = projects.map((project) => project.owner_id);

    let projectsDetails = await Promise.all(
      ownerIds.map(async (ownerId) => {
        if (!isNaN(ownerId)) {
          const ownerUrl = `https://freelancer.com/api/users/0.1/users/${ownerId}/`;
          const ownerResponse = await axios.get(ownerUrl, {
            params: {
              jobs: true,
              reputation: true,
              employer_reputation: true,
              reputation_extra: true,
              employer_reputation_extra: true,
              user_recommendations: true,
              portfolio_details: true,
              preferred_details: true,
              badge_details: true,
              status: true,
            },
            headers: headers,
          });
          console.log(
            "ownerownerRating: ",
            ownerResponse.data.result?.employer_reputation.entire_history
              .overall
          );
          console.log(
            "ownerownerreviews: ",
            ownerResponse.data.result?.employer_reputation.entire_history
              .reviews ?? 0
          );
          console.log(
            "ownerowner3: ",
            ownerResponse.data.result?.employer_reputation.last3months.overall
          );
          console.log(
            "ownerowner12: ",
            ownerResponse.data.result?.employer_reputation.last12months.overall
          );
          return {
            username: ownerResponse.data.result.username,
            publicName: ownerResponse.data.result.public_name,
            country: ownerResponse.data.result.location.country.name,
            payment: ownerResponse.data.result.status.payment_verified,
            email: ownerResponse.data.result.status.email_verified,
            deposit_made: ownerResponse.data.result.status.deposit_made,
            identity_verified:
              ownerResponse.data.result.status.identity_verified,
            countryShortName: ownerResponse.data.result.timezone.country,
            userReviews:
              ownerResponse.data.result?.employer_reputation.entire_history
                .reviews ?? 0,
            userLastThree:
              ownerResponse.data.result?.employer_reputation.last3months.all ??
              0,
            userLastTwelve:
              ownerResponse.data.result?.employer_reputation.last12months.all ??
              0,
            userTotalProjects:
              ownerResponse.data.result?.employer_reputation.entire_history
                .all ?? 0,
            userRating:
              ownerResponse.data.result?.employer_reputation.entire_history
                .overall ?? 0,
          };
        } else {
          console.log("Invalid owner ID:", ownerId);
          return null;
        }
      })
    );

    projectsDetails = projectsDetails.filter(Boolean);

    const projects3 = responseData.result.projects.map((project, index) => ({
      projectid: project.id,
      description: project.description,
      title: project.title,
      currencyName: project.currency.name,
      currencySign: project.currency.sign,
      bidCount: project.bid_stats.bid_count,
      bidAverage: project.bid_stats.bid_avg,
      jobNames: project.jobs.map((job) => job.name),
      minimumBudget: project.budget.minimum,
      maximumBudget: project.budget.maximum,
      country: project.location.country.flag_url,
      fullName: projectsDetails[index].username,
      displayName: projectsDetails[index].publicName,
      ownerCountry: projectsDetails[index].country,
      payment: projectsDetails[index].payment,
      email: projectsDetails[index].email,
      deposit_made: projectsDetails[index].deposit_made,
      identity_verified: projectsDetails[index].identity_verified,
      countryShortName: projectsDetails[index].countryShortName,
      reviews: projectsDetails[index].userReviews,
      allProjects: projectsDetails[index].userTotalProjects,
      yearlyProject: projectsDetails[index].userLastTwelve,
      quaterlyProject: projectsDetails[index].userLastThree,
      rating: projectsDetails[index].userRating,
    }));

    const projects2 = projects3.filter((project) => {
      const projectCountry = project.countryShortName
        ? project.countryShortName.toLowerCase()
        : "";
      if (excludedCountries.includes(projectCountry)) {
        return false;
      }
      if (
        project.jobNames.some((skill) =>
          excludedSkills.includes(skill.toLowerCase())
        )
      ) {
        return false;
      }
      return true;
    });

    const totalCount = responseData.result.total_count;
    const totalPages = Math.ceil(totalCount / pageSize);

    projects2.forEach((project) => {
      let averageBid = parseInt(project.bidAverage);
      let lowRange = parseInt(user.lower_bid_range);
      let highRange = parseInt(user.higher_bid_range);

      const lowerValue = averageBid * (lowRange / 100);
      const higherValue = averageBid * (highRange / 100);

      let smallValue = averageBid - lowerValue;
      let largeValue = averageBid + higherValue;

      let randomValue = Math.floor(
        smallValue + Math.random() * (largeValue - smallValue)
      );
      project.randomValue = randomValue;
    });

    lastFetchedProjectId = projects2.length > 0 ? projects2[0].projectid : null; // Store the ID of the most recent project
    let idForReview = projects2.map((project) => project.projectid);
    console.log("id for review : ", idForReview);
    console.log(" ownerIds : ", ownerIds);
    console.log(" project 2 : ", projects2);
    console.log(
      "Projects fetched : ",
      +lastFetchedProjectId + ", Type: " + typeof lastFetchedProjectId
    );
    res.render("searchCopy", {
      userAutoBid,
      user,
      data: projects2,
      currentPage: page,
      totalPages: totalPages,
      projectIds: projects2.map((project) => project.projectid), // Send project IDs to the frontend
    });
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).send("Error fetching data");
  }
});
// To store the ID of the last fetched project

router.get("/checkNewProjects", sessionChecker, async (req, res) => {
  const url = "https://freelancer.com/api/projects/0.1/projects/all";

  try {
    let id = req.session.user._id;
    let user = await Users.findOne({ _id: id });

    if (!user) {
      return res.status(404).send("User not found");
    }

    let accessToken = user.access_token;
    const excludedSkills = user.excluded_skills.map((skill) =>
      skill.toLowerCase()
    );
    const excludedCountries = user.excluded_countries.map((country) =>
      country.toLowerCase()
    );
    let userSkills = req.session.user.skills;

    const userSkillsWithValue = userSkills
      .map((skill) => {
        const matchedSkill = allSkills.find((s) => s.tag === skill);
        return matchedSkill ? { skill, value: matchedSkill.value } : null;
      })
      .filter(Boolean);
    const userSkillValues = userSkillsWithValue.map((skill) =>
      Number(skill.value)
    );

    const headers = { "freelancer-oauth-v1": accessToken };

    const params = {
      jobs: userSkillValues,
      min_avg_price: 10,
      project_statuses: ["active"],
      full_description: true,
      compact: true,
      limit: 1, // Only fetch the most recent project
    };

    const response = await axios.get(url, {
      params: params,
      headers: headers,
    });

    const responseData = response.data;
    const projects = responseData.result.projects;
    console.log("search projects: ", projects);

    if (projects.length > 0) {
      const latestProjectId = projects[0].id;
      console.log(
        "Project: " + latestProjectId + ", Type: " + typeof latestProjectId
      );
      console.log(
        "Project2: " +
          lastFetchedProjectId +
          ", Type: " +
          typeof lastFetchedProjectId
      );

      if (lastFetchedProjectId && latestProjectId !== lastFetchedProjectId) {
        lastFetchedProjectId = latestProjectId;
        return res.json({ newProject: true, project: projects[0] });
      }

      lastFetchedProjectId = latestProjectId;
    }

    res.json({ newProject: false });
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).send("Error fetching data");
  }
});

router.post("/place/automaticBid", sessionChecker, async (req, res) => {
  console.log("heyyyyyyyyyyyyyyyy body", req.body);
  try {
    const projects = await Projects.find();

    // Extract data from the request body
    const { bid_price, project_id } = req.body;
    let title = req.body.project_title;
    let username = req.body.user_name;
    const jobNames = req.body.project_jobs.split(",");
    let project_country = req.body.project_country;
    // Retrieve user data
    const id = req.session.user._id; // Update with the correct user ID retrieval mechanism

    const user = await Users.findOne({ _id: id });
    const userId = parseInt(user.id);
    console.log("here is user-------->", user);

    let projId = parseInt(project_id);
    let amount = parseFloat(bid_price);
    let accessToken = user.access_token;
    console.log("here is access Token-------->", accessToken);

    let userSkills = user.skills;
    const templates = await Templates.find({ userId: id }).populate("category");

    // Function to randomly decide inclusion for templates with always_include = false
    const randomlyInclude = (probability) => Math.random() < probability;

    // Filter templates by category, deciding randomly for always_include = false
    const filteredTemplates = templates.filter((template) => {
      if (template.category && template.category.always_include === true) {
        return true; // Always include
      } else if (
        template.category &&
        template.category.always_include === false
      ) {
        return randomlyInclude(0.5); // 50% chance to include
      }
      return false; // Exclude if category is not defined or always_include is not specified
    });

    // Group and sort filteredTemplates by category position
    const groupedAndSortedTemplates = filteredTemplates.reduce(
      (acc, template) => {
        const categoryId = template.category._id.toString();
        if (!acc[categoryId]) {
          acc[categoryId] = {
            position: template.category.position,
            templates: [],
          };
        }
        acc[categoryId].templates.push(template);
        return acc;
      },
      {}
    );

    // Convert object to array and sort by position
    const sortedCategories = Object.values(groupedAndSortedTemplates).sort(
      (a, b) => a.position - b.position
    );
    console.log(sortedCategories);

    // Function to get final content from templates for a project
    const getFinalContentForProject = (title, username, templates, userSkills) => {
      return templates.reduce((acc, category) => {
        const randomTemplateIndex = Math.floor(
          Math.random() * category.templates.length
        );
        const selectedTemplate = category.templates[randomTemplateIndex];
        const matchingSkills = jobNames.filter(jobName => userSkills.includes(jobName));
        const replacedContent =
          selectedTemplate.content
            .replace(/{{Project Title}}/g, title)
            .replace(/{{Owner Name}}/g, username)
            .replace(/{{Owner Full Name}}/g, username)
            .replace(/{{Job Skills}}/g, userSkills.slice(0, 5).join(", "))
            .replace(/{{Matching Job Skills}}/g, matchingSkills.join(", "))
            .replace(/{{Owner First Name}}/g, username.split(" ")[0] || username)
            .replace(/{{Country}}/g, project_country)
            .replace(/{{NewLine}}/g, "\n");

        return acc + replacedContent + "\n"; // Add a newline after each template
      }, "");
    };

    const finalContent = getFinalContentForProject(
      title,
      username,
      sortedCategories,
      userSkills
    );

    console.log("finalContent: ", finalContent);
    // Make the POST request to Freelancer API using fetch
    const response = await fetch(
      `https://www.freelancer.com/api/projects/0.1/bids/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "freelancer-oauth-v1": accessToken,
        },
        body: JSON.stringify({
          project_id: projId,
          bidder_id: userId,
          amount: amount,
          period: 3,
          milestone_percentage: 50,
          description: finalContent,
        }),
      }
    );

    // Parse the JSON response
    const responseData = await response.json();
    if (responseData.status !== "error") {
      let id = req.session.user._id;
      let user = await Users.findOne({ _id: id });
      let bidsAllowed = user.bidsAllow - 1;
      if (bidsAllowed < 0) {
        bidsAllowed = 0; // Ensure bidsAllowed doesn't go below 0
      }
      await Users.updateOne({ _id: id }, { $set: { bidsAllow: bidsAllowed } });
      const date = new Date().toISOString().split("T")[0];
      const newRecord = await Projects.create({
        bidDescription: finalContent,
        projectTitle: title,
        bidAmount: responseData.result.amount,
        userName: username,
        time: date,
        user: req.session.user._id,
      });
    }

    // Log response and send data back to client
    console.log("Response:", responseData);
    return res.status(200).json(responseData);
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});
router.get("/bidai", sessionChecker, async (req, res) => {
  const pricing = await Payments.find({});
  res.render("bidmanAi", { pricing });
});

router.get("/autobid", sessionChecker, (req, res) => {
  res.render("autobid");
});

router.get("/add_skill_set", sessionChecker, async (req, res) => {
  res.render("add-skills");
});
router.post("/placeBid", sessionChecker, async (req, res) => {
  try {
    // Extract data from the request body
    const { customizeData, bidPrice, project_id } = req.body;
    console.log("req body yayayyaay--->", req.body);
    // Retrieve user data
    const id = req.session.user._id; // Update with the correct user ID retrieval mechanism
    let title = req.body.title;
    let username = req.body.user_name;
    const user = await Users.findOne({ _id: id });
    const userId = parseInt(user.id);
    console.log("here is userId-------->", userId);
    // let request_Id = req.session.request_id;
    // console.log("here is requestId-------->", request_Id);
    let projId = parseInt(project_id);
    let amount = parseFloat(bidPrice);
    let accessToken = user.access_token;
    // let accessToken = '2a0e0fde884b8f422172da1a91771b6c';
    console.log("here is access Token-------->", accessToken);
    const versionNumber = 0.1;

    // Make the POST request to Freelancer API using fetch
    const response = await fetch(
      `https://www.freelancer.com/api/projects/0.1/bids/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "freelancer-oauth-v1": accessToken,
        },
        body: JSON.stringify({
          project_id: projId,
          bidder_id: userId,
          amount: amount,
          period: 3,
          milestone_percentage: 50,
          description: customizeData,
          // profile_id: userId,
        }),
      }
    );

    // Parse the JSON response
    const responseData = await response.json();
    if (responseData.status !== "error") {
      let id = req.session.user._id;
      let user = await Users.findOne({ _id: id });
      let bidsAllowed = user.bidsAllow - 1;
      if (bidsAllowed < 0) {
        bidsAllowed = 0; // Ensure bidsAllowed doesn't go below 0
      }
      await Users.updateOne({ _id: id }, { $set: { bidsAllow: bidsAllowed } });
      let dateString = responseData.result.submitdate;
      const date = new Date().toISOString().split("T")[0];
      const newRecord = await Projects.create({
        // Define the fields of the new record
        bidDescription: customizeData,
        projectTitle: title,
        bidAmount: responseData.result.amount,
        userName: username,
        time: date,
        user: req.session.user._id,
        // Add more fields as needed
      });
    }
    // Log response and send data back to client
    console.log("Response:", responseData);
    return res.status(200).json(responseData);
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/generate/randomBid", sessionChecker, async (req, res) => {
  try {
    console.log("here is data---->", req.body);
    let userId = req.session.user._id;
    console.log("user id---->", userId);
    
    // Fetch templates and user details
    const templates = await Templates.find({ userId: userId }).populate("category");
    const user = await Users.find({ _id: userId });
  
    console.log("here are templates------>", templates);
    console.log("here are user------>", user[0].skills);
    console.log("here are job------>", req.body.jobName);
    
    // Split jobName into an array of jobSkills
    const jobSkills = req.body.jobName.split(',');
    const userSkills = user[0].skills;
  
    // Function to randomly decide inclusion for templates with always_include = false
    const randomlyInclude = (probability) => Math.random() < probability;
  
    // Filter templates by category, deciding randomly for always_include = false
    const filteredTemplates = templates.filter((template) => {
      if (template.category && template.category.always_include === true) {
        return true; // Always include
      } else if (template.category && template.category.always_include === false) {
        return randomlyInclude(0.5); // 50% chance to include
      }
      return false; // Exclude if category is not defined or always_include is not specified
    });
  
    // Group and sort filteredTemplates by category position
    const groupedAndSortedTemplates = filteredTemplates.reduce((acc, template) => {
      const categoryId = template.category._id.toString();
      if (!acc[categoryId]) {
        acc[categoryId] = {
          position: template.category.position,
          templates: [],
        };
      }
      acc[categoryId].templates.push(template);
      return acc;
    }, {});
  
    // Convert object to array and sort by position
    const sortedCategories = Object.values(groupedAndSortedTemplates).sort((a, b) => a.position - b.position);
    console.log(sortedCategories);
  
    // Selecting one random template from each category and building the final content string
    let finalContent = sortedCategories.reduce((acc, category) => {
      const randomTemplateIndex = Math.floor(Math.random() * category.templates.length);
      const selectedTemplate = category.templates[randomTemplateIndex];
      
      // Replace placeholders in selectedTemplate.content with actual values
      const matchingSkills = jobSkills.filter(jobName => userSkills.includes(jobName)).join(", ");
      const replacedContent = selectedTemplate.content
        .replace(/{{Project Title}}/g, req.body.title)
        .replace(/{{Owner Name}}/g, req.body.user_name)
        .replace(/{{Owner Full Name}}/g, req.body.user_name)
        .replace(/{{Matching Job Skills}}/g, matchingSkills)
        .replace(/{{Job Skills}}/g, user[0].skills.slice(0, 5).join(", "))
        .replace(/{{Owner First Name}}/g, req.body.user_name.split(" ")[0] || req.body.user_name)
        .replace(/{{Country}}/g, req.body.country)
        .replace(/{{NewLine}}/g, "\n"); // Replace {{NewLine}} with actual newline character
  
      return acc + replacedContent + "\n"; // Ensure each template content ends with a newline
    }, "");
  
    let contentToSend = finalContent;
    console.log("here is content----------", contentToSend);
    return res.status(200).send(contentToSend);
  } catch (error) {
    console.error("Error generating random bid:", error);
    // Handle the error and send an appropriate response
    res.status(500).send("ERROR");
  }
});
router.get("/positions", sessionChecker, async (req, res) => {
  try {
    // Fetch existing positions from the TemplateCategories collection
    const existingPositions = await TemplateCategories.find(
      {},
      "position"
    ).sort({ position: 1 });

    let positionsArray = [];

    // Extract position values from existing records
    positionsArray = existingPositions.map((position) => position.position);

    // Generate suggestions excluding positions that are already taken
    let suggestions = [];
    for (let i = 1; i <= 100; i++) {
      if (!positionsArray.includes(i)) {
        suggestions.push(i);
      }
    }

    // Take only the first 5 available positions
    const availablePositions = suggestions.slice(0, 5);

    res.status(200).json(availablePositions);
  } catch (error) {
    console.error("Error fetching existing positions:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.get("/skill-sets/delete/:id", sessionChecker, async (req, res) => {
  await SkillSets.findByIdAndDelete(req.params.id);
  res.redirect("/skills-sets");
});
router.get("/payment", sessionChecker, async (req, res) => {
  res.render("subscription");
});

router.post("/countries", sessionChecker, async (req, res) => {
  try {
    console.log("Here in country submission body--->", req.body);

    const userId = req.session.user._id;
    console.log("Here in country submission body userId--->", userId);

    // Update the user's excluded countries
    const result = await Users.findOneAndUpdate(
      { _id: userId },
      { excluded_countries: req.body.countries },
      { new: true } // Return the updated document
    );

    if (!result) {
      console.error("User not found or update failed");
      return res.redirect("/countries?error=updateFailed");
    }

    console.log("User excluded countries:", result.excluded_countries);

    // Redirect with success message
    res.redirect("/countries?success=true");
  } catch (error) {
    console.error("Error updating excluded countries:", error);
    res.redirect("/countries?error=unknown");
  }
});

router.post("/skill_set_add", sessionChecker, async (req, res) => {
  let skillIds = req.body.skills.split(",");
  console.log(skillIds);
  console.log("this is session------>", req.session.user);
  userId = req.session.user._id;
  // Find skill names corresponding to the IDs
  let skillNames = allSkills
    .filter((skill) => skillIds.includes(skill.value))
    .map((skill) => skill.tag);

  console.log(skillNames);

  // Do something with the skillNames, like saving them or processing further

  let skillSet = new SkillSets({
    name: req.body.name,
    skills: skillNames,
    user: userId,
  });

  await skillSet.save();

  res.redirect("/skills-sets");
});

router.post("/exculded_skills", sessionChecker, async (req, res) => {
  console.log(req.body);
  userId = req.session.user._id;
  let user = await Users.findById(userId);
  if (req.body.show_excluded_skills) {
    user.show_excluded_skills = req.body.show_excluded_skills;
  }
  user.excluded_skills = req.body.skills;

  await user.save();

  res.redirect("/skills?message=Excluded skills saved successfully.");
});

router.post("/saveSkillsPriority", sessionChecker, async (req, res) => {
  let skillOrder = req.body;
  console.log("Received skill order:", skillOrder);
  let userId = req.session.user._id;
  let user = await Users.findById(userId);
  let hide=user.hide_skills
  console.log("Received skill order2: ", hide);
  skillOrder = [...skillOrder, ...hide];
  console.log("Received skill order3: ",skillOrder)
  await Users.findOneAndUpdate(
    { _id: userId },
    { $set: { skills: skillOrder } }, // Using $set to update the skills field
    { new: true } // Return the updated document
);
  // Here, you would typically save the skill order to a database
  // After saving, respond back with success message or the saved order
  res.status(200).json(skillOrder);
});

router.post("/skills", async (req, res) => {
  const skills = req.body.skills;
  const userId = req.session.user._id;
  let user = await Users.findById(userId);
  let userSkills=user.skills
  let userAutoBid = user.autoBid ? "ON" : "Off";
  // Do something with the skills array, e.g., log it or process it
  console.log(skills,"here  is dimaria");
  console.log(userSkills,"here  is messi");

  const missingInSkills = userSkills.filter(skill => !skills.includes(skill));
const missingInUserSkills = skills.filter(skill => !userSkills.includes(skill));
user.hide_skills = missingInSkills;

await user.save();


  // Respond back to client
  res.redirect("/skills");
});

router.get("/skills", sessionChecker, async (req, res) => {
  const userId = req.session.user._id;
  let user = await Users.findById(userId);
  let userAutoBid = user.autoBid ? "ON" : "Off";
  const currentUrl = req.originalUrl||"/skills";
  console.log(user);
  // console.log(user)
  //   let access_token = user.access_token

  //   const url = "https://freelancer-sandbox.com/api/users/0.1/users/"+user.id;

  //   const headers = {'freelancer-oauth-v1': access_token};

  //   // // Data payload as JSON, here you need to properly set ids, user_id, and seo_url as necessary
  //   //   const data = {
  //   //   // ids: [Number(user.id)],             // This should be the array of IDs you're interested in
  //   //   user_id: Number(user.id),           // The user ID for the request
  //   //   seo_url: user.username // Optional SEO URL parameter
  //   //   };
  //   let response = await axios.get(url, { headers,})

  //   if(response.data){
  // console.log(response.data)
  //   }else{
  //     console.log(error)
  //   }
  if (!req.originalUrl || req.originalUrl === '') {
    req.originalUrl = '/skills';
  }

  res.render("skills", {
    currentUrl: currentUrl,
    userAutoBid,
    hideSkills:user.hide_skills,
    skills: user.skills || [],
    excluded_skills:
      user.excluded_skills.map((skill) => skill.replace(/\//g, "/")) || [], // Escape forward slashes
    show_excluded_skills: user.show_excluded_skills || false,
  });
});

router.get("/skills-sets", sessionChecker, async (req, res) => {
  const currentUrl = req.originalUrl||"/skills-sets";
  let userId = req.session.user._id;
  let user = await Users.findById(userId);
  let userAutoBid = user.autoBid ? "ON" : "Off";
  let skillsets = await SkillSets.find({ user: userId });
  res.render("skills-sets", {currentUrl: currentUrl, userAutoBid, skillsets: skillsets || [] });
});

router.get("/countries", sessionChecker, async (req, res) => {
  const currentUrl = req.originalUrl||"/countries";
  let userId = req.session.user._id;
  let user = await Users.findById(userId);
  let excluded=user.excluded_countries
  console.log("here is excluded countries lise",user.excluded_countries)
  let userAutoBid = user.autoBid ? "ON" : "Off";

  res.render("countries", {currentUrl: currentUrl,
    userAutoBid,
    excluded_countries: user.excluded_countries,
  });
});

router.get("/client-stats", sessionChecker, async (req, res) => {
  const currentUrl = req.originalUrl||"/client-stats";
  let userId = req.session.user._id;
  let user = await Users.findById(userId);
  let userAutoBid = user.autoBid ? "ON" : "Off";
  res.render("clientStats", {
    currentUrl: currentUrl,
    userAutoBid,
    payment_verified: user.payment_verified,
    email_verified: user.email_verified,
    deposit_made: user.deposit_made,
    rating: user.rating,
    projects: user.projects,
  });
});

router.post("/client_stats", sessionChecker, async (req, res) => {
  console.log(req.body);
  let userId = req.session.user._id;
  await Users.findOneAndUpdate(
    { _id: userId },
    {
      payment_verified: req.body.payment_verified,
      email_verified: req.body.email_verified,
      deposit_made: req.body.deposit_made,
      rating: req.body.rating,
      projects: req.body.projects,
    }
  );
  res.redirect("/client-stats");
});

router.get("/budget", sessionChecker, async (req, res) => {
  const currentUrl = req.originalUrl||"/budget";
  let userId = req.session.user._id;
  let user = await Users.findById(userId);
  let userAutoBid = user.autoBid ? "ON" : "Off";
  res.render("budget", {
    currentUrl: currentUrl,
    userAutoBid,
    minimum_budget_fixed: user?.minimum_budget_fixed,
    minimum_budget_hourly: user?.minimum_budget_hourly,
  });
});

router.post("/budget", sessionChecker, async (req, res) => {
  let userId = req.session.user._id;
  await Users.findOneAndUpdate(
    { _id: userId },
    {
      minimum_budget_fixed: req.body.minimum_budget_fixed,
      minimum_budget_hourly: req.body.minimum_budget_hourly,
    }
  );
  res.redirect("/budget");
});

router.get("/bidPrice", sessionChecker, async (req, res) => {
  const currentUrl = req.originalUrl||"/bidPrice";
  let userId = req.session.user._id;
  let user = await Users.findById(userId);
  const biddingPrice = await Biddingprice.findOne({ user: userId });
  let userAutoBid = user.autoBid ? "ON" : "Off";
  console.log("user bidding : ",biddingPrice)
  res.render("bidPrice", {
    currentUrl: currentUrl,
    userAutoBid,
    higher_bid_range: user.higher_bid_range,
    lower_bid_range: user.lower_bid_range,
    biddingPrice 
  });
  
  
});
router.get("/timeSetting", sessionChecker, async (req, res) => {
  const currentUrl = req.originalUrl||"/timeSetting";
  let userId = req.session.user._id;
  let user = await Users.findById(userId);
  let userAutoBid = user.autoBid ? "ON" : "Off";
  res.render("timeSetting", {
    currentUrl: currentUrl,
    userAutoBid,
    timeInterval: user.timeInterval,
    timeLimit: user.timeLimit,
    bidsLimit: user.bidsLimit,
  });
});

router.post("/timeSetting", sessionChecker, async (req, res) => {
  try {
    let userId = req.session.user._id;
    console.log("here is req body", req.body);

    await Users.findOneAndUpdate(
      { _id: userId },
      {
        timeInterval: req.body.time_interval,
        timeLimit: req.body.time_limit,
        bidsLimit: req.body.bid_limit,
      }
    );
    
    // Redirect with success parameter
    res.redirect("/timeSetting?success=true");
  } catch (error) {
    console.error(error);
    // Handle error (you may want to redirect with an error parameter)
    res.redirect("/timeSetting?success=false");
  }
});
router.post("/bidPrice", sessionChecker, async (req, res) => {
  console.log("here is data from bid: ",req.body)
  let userId = req.session.user._id;
  await Users.findOneAndUpdate(
    { _id: userId },
    {
      higher_bid_range: req.body.higher_bid_range,
      lower_bid_range: req.body.lower_bid_range,
    }
  );
  const data = req.body;

  // Format data into the schema format
  const formattedData = {
    micro_project: {
      budget: data['micro-project-budget'],
      bid_usd_aud_cad: data['micro-project-usd-aud-cad-10-30'] ? parseFloat(data['micro-project-usd-aud-cad-10-30']) : undefined,
      bid_gbp: data['micro-project-gbp-10-20'] ? parseFloat(data['micro-project-gbp-10-20']) : undefined,
      bid_eur: data['micro-project-eur-8-30'] ? parseFloat(data['micro-project-eur-8-30']) : undefined,
      bid_inr: data['micro-project-inr-600-1500'] ? parseFloat(data['micro-project-inr-600-1500']) : undefined,
      bid_sgd: data['micro-project-sgd-12-30'] ? parseFloat(data['micro-project-sgd-12-30']) : undefined,
      bid_nzd: data['micro-project-nzd-14-30'] ? parseFloat(data['micro-project-nzd-14-30']) : undefined,
      bid_hkd: data['micro-project-hkd-80-240'] ? parseFloat(data['micro-project-hkd-80-240']) : undefined,
      budget_range_usd_aud_cad: data['micro-project-usd-aud-cad-10-30'] ? '10-30' : undefined,
      budget_range_gbp: data['micro-project-gbp-10-20'] ? '10-20' : undefined,
      budget_range_eur: data['micro-project-eur-8-30'] ? '8-30' : undefined,
      budget_range_inr: data['micro-project-inr-600-1500'] ? '600-1500' : undefined,
      budget_range_sgd: data['micro-project-sgd-12-30'] ? '12-30' : undefined,
      budget_range_nzd: data['micro-project-nzd-14-30'] ? '14-30' : undefined,
      budget_range_hkd: data['micro-project-hkd-80-240'] ? '80-240' : undefined,
    },
    simple_project: {
      budget: data['simple-project-budget'],
      bid_usd_eur_aud_cad_nzd_sgd: data['simple-project-usd-eur-aud-cad-nzd-sgd-30-250'] ? parseFloat(data['simple-project-usd-eur-aud-cad-nzd-sgd-30-250']) : undefined,
      bid_gbp: data['simple-project-gbp-20-250'] ? parseFloat(data['simple-project-gbp-20-250']) : undefined,
      bid_inr: data['simple-project-inr-1500-12500'] ? parseFloat(data['simple-project-inr-1500-12500']) : undefined,
      bid_hkd: data['simple-project-hkd-240-2000'] ? parseFloat(data['simple-project-hkd-240-2000']) : undefined,
      budget_range_usd_eur_aud_cad_nzd_sgd: '30-250',
      budget_range_gbp: '20-250',
      budget_range_inr: '1500-12500',
      budget_range_hkd: '240-2000',
    },
    very_small_project: {
      budget: data['very-small-project-budget'],
      bid_usd_gbp_eur_aud_cad_nzd_sgd: data['very-small-project-usd-gbp-eur-aud-cad-nzd-sgd-250-750'] ? parseFloat(data['very-small-project-usd-gbp-eur-aud-cad-nzd-sgd-250-750']) : undefined,
      bid_inr: data['very-small-project-inr-12500-37500'] ? parseFloat(data['very-small-project-inr-12500-37500']) : undefined,
      bid_hkd: data['very-small-project-hkd-2000-6000'] ? parseFloat(data['very-small-project-hkd-2000-6000']) : undefined,
      budget_range_usd_gbp_eur_aud_cad_nzd_sgd: '250-750',
      budget_range_inr: '12500-37500',
      budget_range_hkd: '2000-6000',
    },
    small_project: {
      budget: data['small-project-budget'],
      bid_usd_gbp_eur_aud_cad_nzd_sgd: data['small-project-usd-gbp-eur-aud-cad-nzd-sgd-750-1500'] ? parseFloat(data['small-project-usd-gbp-eur-aud-cad-nzd-sgd-750-1500']) : undefined,
      bid_inr: data['small-project-inr-37500-75000'] ? parseFloat(data['small-project-inr-37500-75000']) : undefined,
      bid_hkd: data['small-project-hkd-6000-12000'] ? parseFloat(data['small-project-hkd-6000-12000']) : undefined,
      budget_range_usd_gbp_eur_aud_cad_nzd_sgd: '750-1500',
      budget_range_inr: '37500-75000',
      budget_range_hkd: '6000-12000',
    },
    medium_project: {
      budget: data['medium-project-budget'],
      bid_usd_gbp_eur_aud_cad_nzd_sgd: data['medium-project-usd-gbp-eur-aud-cad-nzd-sgd-1500-3000'] ? parseFloat(data['medium-project-usd-gbp-eur-aud-cad-nzd-sgd-1500-3000']) : undefined,
      bid_inr: data['medium-project-inr-75000-150000'] ? parseFloat(data['medium-project-inr-75000-150000']) : undefined,
      bid_hkd: data['medium-project-hkd-12000-24000'] ? parseFloat(data['medium-project-hkd-12000-24000']) : undefined,
      budget_range_usd_gbp_eur_aud_cad_nzd_sgd: '1500-3000',
      budget_range_inr: '75000-150000',
      budget_range_hkd: '12000-24000',
    },
    large_project: {
      budget: data['large-project-budget'],
      bid_usd_gbp_eur_aud_cad_nzd_sgd: data['large-project-usd-gbp-eur-aud-cad-nzd-sgd-3000-5000'] ? parseFloat(data['large-project-usd-gbp-eur-aud-cad-nzd-sgd-3000-5000']) : undefined,
      bid_inr: data['large-project-inr-150000-250000'] ? parseFloat(data['large-project-inr-150000-250000']) : undefined,
      bid_hkd: data['large-project-hkd-24000-40000'] ? parseFloat(data['large-project-hkd-24000-40000']) : undefined,
      budget_range_usd_gbp_eur_aud_cad_nzd_sgd: '3000-5000',
      budget_range_inr: '150000-250000',
      budget_range_hkd: '24000-40000',
    },
    basic_hourly: {
      rate: data['basic-hourly-rate'],
      bid_usd_aud_cad: data['basic-hourly-usd-aud-cad-2-8'] ? parseFloat(data['basic-hourly-usd-aud-cad-2-8']) : undefined,
      bid_gbp: data['basic-hourly-gbp-2-5'] ? parseFloat(data['basic-hourly-gbp-2-5']) : undefined,
      bid_eur: data['basic-hourly-eur-2-6'] ? parseFloat(data['basic-hourly-eur-2-6']) : undefined,
      bid_inr: data['basic-hourly-inr-100-400'] ? parseFloat(data['basic-hourly-inr-100-400']) : undefined,
      bid_nzd_sgd: data['basic-hourly-nzd-sgd-3-10'] ? parseFloat(data['basic-hourly-nzd-sgd-3-10']) : undefined,
      bid_hkd: data['basic-hourly-hkd-16-65'] ? parseFloat(data['basic-hourly-hkd-16-65']) : undefined,
      budget_range_usd_aud_cad: '2-8',
      budget_range_gbp: '2-5',
      budget_range_eur: '2-6',
      budget_range_inr: '100-400',
      budget_range_nzd_sgd: '3-10',
      budget_range_hkd: '16-65',
    },
    moderate_hourly: {
      rate: data['moderate-hourly-rate'],
      bid_usd_aud_cad: data['moderate-hourly-usd-aud-cad-8-15'] ? parseFloat(data['moderate-hourly-usd-aud-cad-8-15']) : undefined,
      bid_gbp: data['moderate-hourly-gbp-5-10'] ? parseFloat(data['moderate-hourly-gbp-5-10']) : undefined,
      bid_eur: data['moderate-hourly-eur-6-12'] ? parseFloat(data['moderate-hourly-eur-6-12']) : undefined,
      bid_inr: data['moderate-hourly-inr-400-750'] ? parseFloat(data['moderate-hourly-inr-400-750']) : undefined,
      bid_nzd_sgd: data['moderate-hourly-nzd-sgd-10-20'] ? parseFloat(data['moderate-hourly-nzd-sgd-10-20']) : undefined,
      bid_hkd: data['moderate-hourly-hkd-65-115'] ? parseFloat(data['moderate-hourly-hkd-65-115']) : undefined,
      budget_range_usd_aud_cad: '8-15',
      budget_range_gbp: '5-10',
      budget_range_eur: '6-12',
      budget_range_inr: '400-750',
      budget_range_nzd_sgd: '10-20',
      budget_range_hkd: '65-115',
    },
    standard_hourly: {
      rate: data['standard-hourly-rate'],
      bid_usd_aud_cad: data['standard-hourly-usd-aud-cad-15-25'] ? parseFloat(data['standard-hourly-usd-aud-cad-15-25']) : undefined,
      bid_gbp: data['standard-hourly-gbp-10-15'] ? parseFloat(data['standard-hourly-gbp-10-15']) : undefined,
      bid_eur: data['standard-hourly-eur-6-12'] ? parseFloat(data['standard-hourly-eur-6-12']) : undefined,
      bid_inr: data['standard-hourly-inr-750-1250'] ? parseFloat(data['standard-hourly-inr-750-1250']) : undefined,
      bid_nzd_sgd: data['standard-hourly-nzd-sgd-20-30'] ? parseFloat(data['standard-hourly-nzd-sgd-20-30']) : undefined,
      bid_hkd: data['standard-hourly-hkd-115-200'] ? parseFloat(data['standard-hourly-hkd-115-200']) : undefined,
      budget_range_usd_aud_cad: '15-25',
      budget_range_gbp: '10-20',
      budget_range_eur: '6-12',
      budget_range_inr: '750-1250',
      budget_range_nzd_sgd: '20-30',
      budget_range_hkd: '115-200',
    },
    skilled_hourly: {
      rate: data['skilled-hourly-rate'],
      bid_usd_aud_cad: data['skilled-hourly-usd-aud-cad-25-50'] ? parseFloat(data['skilled-hourly-usd-aud-cad-25-50']) : undefined,
      bid_gbp: data['skilled-hourly-gbp-18-36'] ? parseFloat(data['skilled-hourly-gbp-18-36']) : undefined,
      bid_eur: data['skilled-hourly-eur-18-36'] ? parseFloat(data['skilled-hourly-eur-18-36']) : undefined,
      bid_inr: data['skilled-hourly-inr-1250-2500'] ? parseFloat(data['skilled-hourly-inr-1250-2500']) : undefined,
      bid_nzd_sgd: data['skilled-hourly-nzd-sgd-30-60'] ? parseFloat(data['skilled-hourly-nzd-sgd-30-60']) : undefined,
      bid_hkd: data['skilled-hourly-hkd-200-400'] ? parseFloat(data['skilled-hourly-hkd-200-400']) : undefined,
      budget_range_usd_aud_cad: '25-50',
      budget_range_gbp: '18-36',
      budget_range_eur: '18-36',
      budget_range_inr: '1250-2500',
      budget_range_nzd_sgd: '30-60',
      budget_range_hkd: '200-400',
    },
  };
  
  await Biddingprice.findOneAndUpdate(
    { user: userId },
    { $set: formattedData },
    { new: true, upsert: true } // Create if not exists
  );

  

  res.redirect("/bidPrice");
});

router.get("/period", sessionChecker, async (req, res) => {
  const currentUrl = req.originalUrl||"/period";
  let userId = req.session.user._id;
  let user = await Users.findById(userId);
  let userAutoBid = user.autoBid ? "ON" : "Off";
  let periods = await Periods.find({ user: userId });
  res.render("period", { currentUrl: currentUrl,userAutoBid, periods });
});

const parseData = (body) => {
  const result = [];

  // Extract numbers from keys and sort by unique index
  const indices = Object.keys(body)
    .filter((key) => key.match(/\d+/)) // filter keys containing digits
    .map((key) => key.match(/\d+/)[0]) // extract the digits
    .filter((value, index, self) => self.indexOf(value) === index); // get unique indices

  indices.forEach((index) => {
    const obj = {
      lower: body[`lower[${index}]`],
      higher: body[`higher[${index}]`],
      period: body[`period[${index}]`],
    };
    result.push(obj);
  });

  return result;
};
router.post("/period", sessionChecker, async (req, res) => {
  let userId = req.session.user._id;
  // const parsedData = parseData(req.body);
  // Access the form data from req.body
  const lowerBidPrices = req.body.lower; // Array of lower bid prices
  const higherBidPrices = req.body.higher; // Array of higher bid prices
  const projectPeriods = req.body.period; // Array of project periods

  // Do whatever you need with the form data
  console.log("Lower Bid Prices:", lowerBidPrices);
  console.log("Higher Bid Prices:", higherBidPrices);
  console.log("Project Periods:", projectPeriods);
  let parsedData = [];

  // Iterate over the arrays and create an object for each index
  for (let i = 0; i < lowerBidPrices.length; i++) {
    // Create an object for each index with the corresponding values
    let dataObject = {
      lower: lowerBidPrices[i],
      higher: higherBidPrices[i],
      period: projectPeriods[i],
    };

    // Push the created object into the parsedData array
    parsedData.push(dataObject);
  }

  console.log("here=--->", parsedData);

  for (let index = 0; index < parsedData.length; index++) {
    let period = new Periods({
      lower: parsedData[index].lower,
      higher: parsedData[index].higher,
      period: parsedData[index].period,
      user: userId,
    });
    await period.save();
  }
  res.redirect("/period");
});
router.post("/moveUp/:id", sessionChecker, async (req, res) => {
  try {
    const category = await TemplateCategories.findById(req.params.id);
    const previousCategory = await TemplateCategories.findOne({
      position: { $lt: category.position },
    }).sort({ position: -1 });

    if (previousCategory) {
      const tempPosition = category.position;
      category.position = previousCategory.position;
      previousCategory.position = tempPosition;

      await category.save();
      await previousCategory.save();
    }

    res.redirect("/tcats");
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});
router.get("/moveUp/:id", sessionChecker, async (req, res) => {
  try {
    console.log("HERE IN MOVEUP---->");
    const category = await TemplateCategories.findById(req.params.id);
    const previousCategory = await TemplateCategories.findOne({
      position: { $lt: category.position },
    }).sort({ position: -1 });

    if (previousCategory) {
      const tempPosition = category.position;
      category.position = previousCategory.position;
      previousCategory.position = tempPosition;

      await category.save();
      await previousCategory.save();
    }

    res.redirect("/tcats");
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});
router.get("/admin/dashboard", isAdmin, async (req, res) => {
  let users = await Users.find({});
  let usersOnTrial = await Users.find({ subscriptionType: "trial" });
  let usersOnMonthly = await Users.find({ subscriptionType: "monthly" });
  let usersOnSemiAnnual = await Users.find({ subscriptionType: "semi-annual" });
  let usersOnAnnual = await Users.find({ subscriptionType: "annual" });
  let usersOnNotSubscribed = await Users.find({
    subscriptionType: "not-subscribed",
  });
  console.log("users on trial ", usersOnTrial.length);
  let userlength = users.length;
  let userOnTrialLength = usersOnTrial.length;
  let userOnMonthlyLength = usersOnMonthly.length;
  let userOnSemiAnnualLength = usersOnMonthly.length;
  let userOnAnnualLength = usersOnAnnual.length;
  let userOnNotSubscribedLength = usersOnNotSubscribed.length;

  res.render("adminDashboard", {
    userlength,
    userOnTrialLength,
    userOnMonthlyLength,
    userOnSemiAnnualLength,
    userOnAnnualLength,
    userOnNotSubscribedLength,
  });
});
router.get("/admin/logout", isAdmin, async (req, res) => {
  delete req.session.admin;
  res.redirect("/login");
});
router.post('/admin/chatGptBid', isAdmin, async (req, res) => {
  const { userId, aiBid } = req.body;
  
  try {
    console.log('userId: ', userId);
    console.log('aiBid: ', aiBid);

    // Find user by ID
    const user = await Users.findById(userId);

    if (!user) {
      // If user is not found, send a 404 error response
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Update user aiBid based on the value of aiBid
    user.aiBid = aiBid 

    // Save the user document
    await user.save();
    console.log("user: ",user)

    // Redirect to the totalUsers page
    res.redirect('/admin/totalUsers');
  } catch (error) {
    // Log the error for debugging purposes
    console.error('Error updating user AI Bid status:', error);

    // Send an error response with a status code and message
    res.status(500).json({ success: false, message: 'Failed to update AI Bid status' });
  }
});
router.get("/admin/totalUsers", isAdmin, async (req, res) => {
  try {
    // Get search query parameter from the frontend
    const searchQuery = req.query.searchQuery;

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    // Construct the search query
    const query = { isAdmin: false };

    // If search query exists, add search conditions to the query
    if (searchQuery) {
      query.$or = [
        { username: { $regex: searchQuery, $options: "i" } }, // Case-insensitive search for username
        { email: { $regex: searchQuery, $options: "i" } }, // Case-insensitive search for email
        // Add more fields to search here if needed
      ];
    }

    // Fetch users matching the search query from the database
    const users = await Users.find(query).skip(skip).limit(limit);

    // Count total number of users matching the search query
    const totalUsers = await Users.countDocuments(query);

    // Calculate total pages for pagination
    const totalPages = Math.ceil(totalUsers / limit);

    // Render the adminTotalUsers view and pass the users data, pagination info, and search query to it
    res.render("adminTotalUsers", {
      users,
      currentPage: page,
      totalPages,
      searchQuery,
    });
  } catch (error) {
    // Handle any errors that occur during database query
    console.error("Error fetching users:", error);
    res.status(500).send("Internal Server Error");
  }
});
//
function formatDate(dateString) {
  const date = new Date(dateString);
  const day = date.getDate();
  const month = date.toLocaleString("default", { month: "short" });
  const year = date.getFullYear();
  return `${month} ${day} ${year}`;
}
// Route handler for admin/editDates
router.get("/admin/editDates", isAdmin, async (req, res) => {
  try {
    // Get search query parameter from the frontend
    const searchQuery = req.query.searchQuery;

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    // Construct the search query
    const query = { isAdmin: false };

    // If search query exists, add search conditions to the query
    if (searchQuery) {
      query.$or = [
        { username: { $regex: searchQuery, $options: "i" } }, // Case-insensitive search for username
        { email: { $regex: searchQuery, $options: "i" } }, // Case-insensitive search for email
        // Add more fields to search here if needed
      ];
    }

    // Fetch users matching the search query from the database
    const users = await Users.find(query).skip(skip).limit(limit);

    // Convert subscription dates to JavaScript Date objects and format them
    users.forEach((user) => {
      user.subscriptionStartDate = formatDate(user.subscriptionStartDate);
      user.subscriptionEndDate = formatDate(user.subscriptionEndDate);
    });

    // Count total number of users matching the search query
    const totalUsers = await Users.countDocuments(query);

    // Calculate total pages for pagination
    const totalPages = Math.ceil(totalUsers / limit);

    // Render the adminDates view and pass the users data, pagination info, and search query, along with the formatDate function, to it
    res.render("adminDates", {
      users,
      currentPage: page,
      totalPages,
      searchQuery,
      formatDate,
    });
  } catch (error) {
    // Handle any errors that occur during database query
    console.error("Error fetching users:", error);
    res.status(500).send("Internal Server Error");
  }
});
router.post("/admin/editDates", isAdmin, async (req, res) => {
  try {
    console.log("req bode", req.body);
    const dateString = req.body.selectedDate;
    const parsedDate = new Date(dateString);
    const formattedDate = parsedDate.toISOString();
    let user = await Users.findById(req.body.userId);
    if (user) {
      user.subscriptionEndDate = formattedDate;
      await user.save();
      // Respond with a success message
      res.status(200).json({
        success: true,
        message: `User ${user.username} Have  ${user.newSubscriptionType} subscription.`,
      });
    } else {
      // Handle case where user is not found
      res.status(404).json({ success: false, message: "User not found." });
    }
  } catch (error) {
    // Handle any errors that occur during database query
    console.error("Error fetching users:", error);
    res.status(500).send("Internal Server Error");
  }
});
router.get("/admin/editSubscription", isAdmin, async (req, res) => {
  try {
    // Get search query parameter from the frontend
    const searchQuery = req.query.searchQuery;

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    // Construct the search query
    const query = { isAdmin: false };

    // If search query exists, add search conditions to the query
    if (searchQuery) {
      query.$or = [
        { username: { $regex: searchQuery, $options: "i" } }, // Case-insensitive search for username
        { email: { $regex: searchQuery, $options: "i" } }, // Case-insensitive search for email
        // Add more fields to search here if needed
      ];
    }

    // Fetch users matching the search query from the database
    const users = await Users.find(query).skip(skip).limit(limit);

    // Count total number of users matching the search query
    const totalUsers = await Users.countDocuments(query);

    // Calculate total pages for pagination
    const totalPages = Math.ceil(totalUsers / limit);

    // Render the adminTotalUsers view and pass the users data, pagination info, and search query to it
    res.render("adminSubscription", {
      users,
      currentPage: page,
      totalPages,
      searchQuery,
    });
  } catch (error) {
    // Handle any errors that occur during database query
    console.error("Error fetching users:", error);
    res.status(500).send("Internal Server Error");
  }
});
router.post("/admin/editSubscription", isAdmin, async (req, res) => {
  try {
    let user = await Users.findById(req.body.userId);
    if (user) {
      user.subscriptionType = req.body.newSubscriptionType;
      await user.save();
      // Respond with a success message
      res.status(200).json({
        success: true,
        message: `User ${user.username} Have  ${user.newSubscriptionType} subscription.`,
      });
    } else {
      // Handle case where user is not found
      res.status(404).json({ success: false, message: "User not found." });
    }
  } catch (error) {
    // Handle any errors that occur during database query
    console.error("Error fetching users:", error);
    res.status(500).send("Internal Server Error");
  }
});
router.get("/admin/bidsAllowed", isAdmin, async (req, res) => {
  try {
    // Get search query parameter from the frontend
    const searchQuery = req.query.searchQuery;

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    // Construct the search query
    const query = { isAdmin: false };

    // If search query exists, add search conditions to the query
    if (searchQuery) {
      query.$or = [
        { username: { $regex: searchQuery, $options: "i" } }, // Case-insensitive search for username
        { email: { $regex: searchQuery, $options: "i" } }, // Case-insensitive search for email
        // Add more fields to search here if needed
      ];
    }

    // Fetch users matching the search query from the database
    const users = await Users.find(query).skip(skip).limit(limit);

    // Count total number of users matching the search query
    const totalUsers = await Users.countDocuments(query);

    // Calculate total pages for pagination
    const totalPages = Math.ceil(totalUsers / limit);

    // Render the adminTotalUsers view and pass the users data, pagination info, and search query to it
    res.render("adminBidsAllowed", {
      users,
      currentPage: page,
      totalPages,
      searchQuery,
    });
  } catch (error) {
    // Handle any errors that occur during database query
    console.error("Error fetching users:", error);
    res.status(500).send("Internal Server Error");
  }
});
router.post("/admin/bidsAllowed", isAdmin, async (req, res) => {
  try {
    console.log("req body", req.body);

    let user = await Users.findById(req.body.userId);
    if (user) {
      user.bidsAllow = req.body.newValue;
      await user.save();
      // Respond with a success message
      res.status(200).json({
        success: true,
        message: `User ${user.username} Have  ${user.bidsAllow} remaining.`,
      });
    } else {
      // Handle case where user is not found
      res.status(404).json({ success: false, message: "User not found." });
    }
  } catch (error) {
    // Handle any errors that occur during database query
    console.error("Error fetching users:", error);
    res.status(500).send("Internal Server Error");
  }
});
router.get("/admin/blockUsers", isAdmin, async (req, res) => {
  try {
    // Get search query parameter from the frontend
    const searchQuery = req.query.searchQuery;

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    // Construct the search query
    const query = { isAdmin: false };

    // If search query exists, add search conditions to the query
    if (searchQuery) {
      query.$or = [
        { username: { $regex: searchQuery, $options: "i" } }, // Case-insensitive search for username
        { email: { $regex: searchQuery, $options: "i" } }, // Case-insensitive search for email
        // Add more fields to search here if needed
      ];
    }

    // Fetch users matching the search query from the database
    const users = await Users.find(query).skip(skip).limit(limit);

    // Count total number of users matching the search query
    const totalUsers = await Users.countDocuments(query);

    // Calculate total pages for pagination
    const totalPages = Math.ceil(totalUsers / limit);

    // Render the adminTotalUsers view and pass the users data, pagination info, and search query to it
    res.render("adminBlockUsers", {
      users,
      currentPage: page,
      totalPages,
      searchQuery,
    });
  } catch (error) {
    // Handle any errors that occur during database query
    console.error("Error fetching users:", error);
    res.status(500).send("Internal Server Error");
  }
});
router.post("/admin/blockUsers", isAdmin, async (req, res) => {
  try {
    console.log("queru ", req.query);
    console.log(" parameter", req.params);
    console.log("body", req.body);
    let user = await Users.findById(req.body.userId);
    if (user) {
      user.isLocked = req.body.isLocked;
      user.autoBid = false;
      await user.save();
      // Respond with a success message
      res.status(200).json({
        success: true,
        message: `User ${user.username} is now ${
          user.isLocked ? "blocked" : "unblocked"
        }.`,
      });
    } else {
      // Handle case where user is not found
      res.status(404).json({ success: false, message: "User not found." });
    }
  } catch (error) {
    // Handle any errors that occur during database query
    console.error("Error fetching users:", error);
    res.status(500).send("Internal Server Error");
  }
});
router.get("/admin/trialUsers", isAdmin, async (req, res) => {
  try {
    // Get search query parameter from the frontend
    const searchQuery = req.query.searchQuery;

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    // Construct the search query
    const query = { subscriptionType: "trial", isAdmin: false }; // Fetch only trial users

    // If search query exists, add search conditions to the query
    if (searchQuery) {
      query.$or = [
        { username: { $regex: searchQuery, $options: "i" } }, // Case-insensitive search for username
        { email: { $regex: searchQuery, $options: "i" } }, // Case-insensitive search for email
        // Add more fields to search here if needed
      ];
    }

    // Fetch trial users matching the search query from the database
    const users = await Users.find(query).skip(skip).limit(limit);

    // Count total number of trial users matching the search query
    const totalUsers = await Users.countDocuments(query);

    // Calculate total pages for pagination
    const totalPages = Math.ceil(totalUsers / limit);

    // Render the adminTrialUsers view and pass the users data, pagination info, and search query to it
    res.render("adminTrialUsers", {
      users,
      currentPage: page,
      totalPages,
      searchQuery,
    });
  } catch (error) {
    // Handle any errors that occur during database query
    console.error("Error fetching trial users:", error);
    res.status(500).send("Internal Server Error");
  }
});
router.get("/admin/monthlyUsers", isAdmin, async (req, res) => {
  try {
    // Get search query parameter from the frontend
    const searchQuery = req.query.searchQuery;

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    // Construct the search query
    const query = { subscriptionType: "monthly", isAdmin: false }; // Fetch only trial users

    // If search query exists, add search conditions to the query
    if (searchQuery) {
      query.$or = [
        { username: { $regex: searchQuery, $options: "i" } }, // Case-insensitive search for username
        { email: { $regex: searchQuery, $options: "i" } }, // Case-insensitive search for email
        // Add more fields to search here if needed
      ];
    }

    // Fetch trial users matching the search query from the database
    const users = await Users.find(query).skip(skip).limit(limit);

    // Count total number of trial users matching the search query
    const totalUsers = await Users.countDocuments(query);

    // Calculate total pages for pagination
    const totalPages = Math.ceil(totalUsers / limit);

    // Render the adminTrialUsers view and pass the users data, pagination info, and search query to it
    res.render("adminMonthlyUsers", {
      users,
      currentPage: page,
      totalPages,
      searchQuery,
    });
  } catch (error) {
    // Handle any errors that occur during database query
    console.error("Error fetching trial users:", error);
    res.status(500).send("Internal Server Error");
  }
});
router.get("/admin/semiAnnualUsers", isAdmin, async (req, res) => {
  try {
    // Get search query parameter from the frontend
    const searchQuery = req.query.searchQuery;

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    // Construct the search query
    const query = { subscriptionType: "semi-annual", isAdmin: false }; // Fetch only trial users

    // If search query exists, add search conditions to the query
    if (searchQuery) {
      query.$or = [
        { username: { $regex: searchQuery, $options: "i" } }, // Case-insensitive search for username
        { email: { $regex: searchQuery, $options: "i" } }, // Case-insensitive search for email
        // Add more fields to search here if needed
      ];
    }

    // Fetch trial users matching the search query from the database
    const users = await Users.find(query).skip(skip).limit(limit);

    // Count total number of trial users matching the search query
    const totalUsers = await Users.countDocuments(query);

    // Calculate total pages for pagination
    const totalPages = Math.ceil(totalUsers / limit);

    // Render the adminTrialUsers view and pass the users data, pagination info, and search query to it
    res.render("adminSemiAnnualUsers", {
      users,
      currentPage: page,
      totalPages,
      searchQuery,
    });
  } catch (error) {
    // Handle any errors that occur during database query
    console.error("Error fetching trial users:", error);
    res.status(500).send("Internal Server Error");
  }
});
router.get("/admin/annualUsers", isAdmin, async (req, res) => {
  try {
    // Get search query parameter from the frontend
    const searchQuery = req.query.searchQuery;

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    // Construct the search query
    const query = { subscriptionType: "annual", isAdmin: false }; // Fetch only trial users

    // If search query exists, add search conditions to the query
    if (searchQuery) {
      query.$or = [
        { username: { $regex: searchQuery, $options: "i" } }, // Case-insensitive search for username
        { email: { $regex: searchQuery, $options: "i" } }, // Case-insensitive search for email
        // Add more fields to search here if needed
      ];
    }

    // Fetch trial users matching the search query from the database
    const users = await Users.find(query).skip(skip).limit(limit);

    // Count total number of trial users matching the search query
    const totalUsers = await Users.countDocuments(query);

    // Calculate total pages for pagination
    const totalPages = Math.ceil(totalUsers / limit);

    // Render the adminTrialUsers view and pass the users data, pagination info, and search query to it
    res.render("adminAnnualUsers", {
      users,
      currentPage: page,
      totalPages,
      searchQuery,
    });
  } catch (error) {
    // Handle any errors that occur during database query
    console.error("Error fetching trial users:", error);
    res.status(500).send("Internal Server Error");
  }
});
router.get("/admin/notSubscribedUsers", isAdmin, async (req, res) => {
  try {
    // Get search query parameter from the frontend
    const searchQuery = req.query.searchQuery;

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    // Construct the search query
    const query = { subscriptionType: "not-subscribed", isAdmin: false }; // Fetch only trial users

    // If search query exists, add search conditions to the query
    if (searchQuery) {
      query.$or = [
        { username: { $regex: searchQuery, $options: "i" } }, // Case-insensitive search for username
        { email: { $regex: searchQuery, $options: "i" } }, // Case-insensitive search for email
        // Add more fields to search here if needed
      ];
    }

    // Fetch trial users matching the search query from the database
    const users = await Users.find(query).skip(skip).limit(limit);

    // Count total number of trial users matching the search query
    const totalUsers = await Users.countDocuments(query);

    // Calculate total pages for pagination
    const totalPages = Math.ceil(totalUsers / limit);

    // Render the adminTrialUsers view and pass the users data, pagination info, and search query to it
    res.render("adminNotSubscribedUsers", {
      users,
      currentPage: page,
      totalPages,
      searchQuery,
    });
  } catch (error) {
    // Handle any errors that occur during database query
    console.error("Error fetching trial users:", error);
    res.status(500).send("Internal Server Error");
  }
});
router.get("/admin/passChange", isAdmin, (req, res) => {
  res.render("adminPassChange");
});
router.get("/admin/passwordChanged", (req, res) => {
  // Render a view or send a response indicating that the password change was successful
  res.render("adminPassChange"); // Assuming you have a view file named passwordChanged.ejs
});
router.post("/admin/changePassword", isAdmin, async (req, res) => {
  try {
    console.log("session", req.session);
    console.log("password is ", req.session.admin.password);
    let userCurrentPassword = req.session.admin.password;
    let enteredOldPassword = req.body.old_password;
    let enteredNewPassword = req.body.new_password;
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(enteredNewPassword, saltRounds);
    const isMatch = await bcrypt.compare(
      enteredOldPassword,
      userCurrentPassword
    );

    if (!isMatch) {
      console.log("Old password does not match");
      return res.redirect("/admin/passwordChanged?error=oldPassword");
    }

    const user = await Users.findOne({ _id: req.session.admin._id });
    if (user) {
      user.password = hashedPassword;
      await user.save();
      console.log("Password updated successfully");
    } else {
      console.log("User not found");
      return res.redirect("/changePassword?error=userNotFound");
    }

    // Redirect the user to a success page with a success message
    return res.redirect("/passwordChanged?success=true");
  } catch (error) {
    console.error("Error updating password:", error);
    return res.redirect("/changePassword?error=unknown");
  }
});
router.get("/admin/changeInfo", isAdmin, async (req, res) => {
  // Render a view or send a response indicating that the password change was successful
  let userId = req.session.admin._id;
  const userData = await Users.find({ _id: userId });
  console.log("userData", userData);
  res.render("adminInfo", { userData }); // Assuming you have a view file named passwordChanged.ejs
});
router.post("/admin/get-user-bids", isAdmin, async (req, res) => {
  let userId = req.body.userId;
  // Find all projects with the given userId
  const userProjects = await Projects.find({ user: userId });
  console.log("her is userProjects", userProjects);
  // Send the user projects data to the frontend
  res.json({ userProjects });
});
router.post("/admin/changeInfo", isAdmin, async (req, res) => {
  try {
    console.log("req body here", req.body);

    const user = await Users.findOne({ _id: req.session.admin._id });
    if (user) {
      user.email = req.body.email;
      user.phone = req.body.phone;
      user.skype = req.body.skype;
      user.telegram = req.body.telegram;
      await user.save();
      req.session.user.adminEmail = user.email;
      req.session.user.adminPhone = user.phone;
      req.session.user.adminSkype = user.skype;
      req.session.user.adminTelegram = user.telegram;
    }

    // Redirect the user to a success page with a success message
    return res.redirect("/admin/changeInfo?success=true");
  } catch (error) {
    console.error("Error updating password:", error);
    return res.redirect("/admin/changeInfo?error=unknown");
  }
});

// Move row down
router.get("/moveDown/:id", sessionChecker, async (req, res) => {
  try {
    const category = await TemplateCategories.findById(req.params.id);
    const nextCategory = await TemplateCategories.findOne({
      position: { $gt: category.position },
    }).sort({ position: 1 });

    if (nextCategory) {
      const tempPosition = category.position;
      category.position = nextCategory.position;
      nextCategory.position = tempPosition;

      await category.save();
      await nextCategory.save();
    }

    res.redirect("/tcats");
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/tcats", sessionChecker, async (req, res) => {
  try {
    const currentUrl = req.originalUrl||"/tcats";
    let userId = req.session.user._id;
    let user = await Users.findById(userId);
    let userAutoBid = user.autoBid ? "ON" : "Off";
    const allCategory = await TemplateCategories.find({ user: userId }).sort({
      position: 1,
    });
    console.log("here is all categories----->", allCategory);
    // Render the 'tcats' template and pass the data to it
    res.render("tcats", {currentUrl: currentUrl, userAutoBid, allCategory: allCategory });
  } catch (error) {
    // Handle errors appropriately
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/deleteTCat/:id", sessionChecker, async (req, res) => {
  const catId = req.params.id;
  try {
    // Find the category by ID and delete it
    await TemplateCategories.findByIdAndDelete(catId);
    const allCategory = await TemplateCategories.find();
    res.render("tcats", { allCategory: allCategory }); // Send success response
  } catch (error) {
    console.error("Error deleting category:", error);
    res.sendStatus(500); // Send error response
  }
});

router.get("/addtcat", sessionChecker, (req, res) => {
  res.render("addTcat");
});

router.post("/addtcat", sessionChecker, async (req, res) => {
  console.log("here is req body of add category form---->", req.body);
  let userId = req.session.user._id;
  let template = new TemplateCategories({
    name: req.body.name,
    always_include: req.body.always_include,
    position: req.body.position,
    user: userId,
  });
  await template.save();
  res.redirect("/tcats");
});

router.get("/temp", sessionChecker, async (req, res) => {
  const currentUrl = req.originalUrl||"/temp";
  let userId = req.session.user._id;
  let user = await Users.findById(userId);
  let userAutoBid = user.autoBid ? "ON" : "Off";
  const allTemplates = await Templates.find({ userId: userId }).populate(
    "category"
  );
  console.log("here are templates------->", allTemplates);
  res.render("temp", { currentUrl: currentUrl, userAutoBid, templates: allTemplates });
});
router.delete("/delete/template/:id", sessionChecker, async (req, res) => {
  const templateId = req.params.id;
  try {
    // Find the template by ID and delete it
    await Templates.findByIdAndDelete(templateId);
    res.sendStatus(200); // Send success response
  } catch (error) {
    console.error("Error deleting template:", error);
    res.sendStatus(500); // Send error response
  }
});
router.get("/edit/template/:id", sessionChecker, async (req, res) => {
  const tempId = req.params.id;

  try {
    let userId = req.session.user._id;
    let userId1 = req.session.user._id;
    let user2 = await Users.findById(userId1);
    let userAutoBid = user2.autoBid ? "ON" : "Off";
    const allTemplates = await Templates.find({ userId: userId }).populate(
      "category"
    );
    // Find the template by ID
    const template = await Templates.findById(tempId).populate("category");
    console.log("here is template", template);
    content = template.content;
    console.log("here is content", content);
    categoryName = template.category.name;
    categoryValue = template.category._id;
    console.log("here is categoryName", categoryName);

    console.log("here is id in edit templates", userId);
    // Assuming you have a variable named 'categories' that contains all template categories
    const categories = await TemplateCategories.find({ user: userId });

    let user;
    try {
      user = await Users.findById(userId);
    } catch (error) {
      console.error("Error fetching user:", error);
      // Handle the error (e.g., send an error response or render an error page)
      // For example: return res.status(500).send('Internal Server Error');
    }

    // If user is null or undefined, set userSkills to an empty array
    const userSkills = user ? user.skills : [];
    console.log(
      "here is recordOf template" +
        template +
        "here is categories " +
        categories +
        "here is userSkills",
      userSkills
    );
    res.render("editTemplate", {
      userAutoBid,
      template,
      categories,
      userSkills,
      content,
      categoryName,
      categoryValue,
    });
  } catch (error) {
    console.error("Error finding template:", error);
    res.sendStatus(500); // Send error response
  }
});
router.post("/add/submitTemplate", sessionChecker, async (req, res) => {
  try {
    let data = req.body;
    let userId = req.session.user._id;
    let user = await Users.findById(userId);
    let userAutoBid = user.autoBid ? "ON" : "Off";
    // Create a new Template instance with the data from req.body
    const newTemplate = new Templates({
      content: data.content,
      skills: data["skills[]"], // Assign the skills array directly
      category: data.template_category_id, // Assuming template_category_id is the category ID
      // If SkillSets is also a reference to another model, provide its value accordingly
      SkillSets: data.skill_sets_id,
      userId: userId,
    });

    // Save the new template to the database
    await newTemplate.save();

    console.log("Template saved:", newTemplate);
    const allTemplates = await Templates.find({ userId: userId }).populate(
      "category"
    );
    console.log("here are templates------->", allTemplates);
    res.render("temp", { userAutoBid, templates: allTemplates });
  } catch (error) {
    console.error("Error saving template:", error);
    res.status(500).send("Internal Server Error");
  }
});
router.post("/update/Template/:id", sessionChecker, async (req, res) => {
  // Extract the template ID from req.params
  const templateId = req.params.id;
  let userId = req.session.user._id;
  let user = await Users.findById(userId);
  let userAutoBid = user.autoBid ? "ON" : "Off";
  // Extract the updated data from req.body
  const data = req.body;

  // Assuming you have already extracted userId

  try {
    // Find the template by ID
    const template = await Templates.findById(templateId);

    // Update the template data
    template.content = data.content;
    template.skills = data.skills;
    template.category = data.template_category_id;
    template.userId = req.session.user._id;

    // Save the updated template
    await template.save();

    const allTemplates = await Templates.find({ userId: userId }).populate(
      "category"
    );
    console.log("here are templates------->", allTemplates);
    res.render("temp", { userAutoBid, templates: allTemplates });
  } catch (error) {
    console.error("Error saving template:", error);
    res.status(500).send("Internal Server Error");
  }
});
router.get("/templateAdd", sessionChecker, async (req, res) => {
  let userId = req.session.user._id;
  const categories = await TemplateCategories.find({ user: userId });

  let user;
  try {
    user = await Users.findById(userId);
  } catch (error) {
    console.error("Error fetching user:", error);
    // Handle the error (e.g., send an error response or render an error page)
    // For example: return res.status(500).send('Internal Server Error');
  }

  // If user is null or undefined, set userSkills to an empty array
  const userSkills = user ? user.skills : [];

  res.render("addTemplate", { categories: categories, userSkills: userSkills });
});

router.get("/editTemp", sessionChecker, (req, res) => {
  res.render("editTemplate");
});

router.get("/passChange", sessionChecker, (req, res) => {
  res.render("passChange", {
    error: req.query.error,
    success: req.query.success
  });
});
router.get("/passwordChanged", (req, res) => {
  // Render a view or send a response indicating that the password change was successful
  res.render("passChange"); // Assuming you have a view file named passwordChanged.ejs
});
router.post("/changePassword", sessionChecker, async (req, res) => {
  try {
    const enteredOldPassword = req.body.old_password;
    const enteredNewPassword = req.body.new_password;

    // Fetch the user from the database
    const user = await Users.findOne({ _id: req.session.user._id });

    if (!user) {
      console.log("User not found");
      return res.redirect("/passChange?error=userNotFound");
    }

    // Compare the entered old password with the stored password
    const isMatch = await bcrypt.compare(enteredOldPassword, user.password);

    if (!isMatch) {
      console.log("Old password does not match");
      return res.redirect("/passChange?error=oldPassword");
    }

    // Hash the new password and update it in the database
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(enteredNewPassword, saltRounds);
    user.password = hashedPassword;
    await user.save();

    console.log("Password updated successfully");
    return res.redirect("/passChange?success=true");
  } catch (error) {
    console.error("Error updating password:", error);
    return res.redirect("/passChange?error=unknown");
  }
});

router.get("/guide", sessionChecker, (req, res) => {
  res.render("guide");
});
router.get("/fakeData", sessionChecker, async (req, res) => {
  console.log(req.body);
  let title = "for books";
  let username = "Waleed";
  const responseData = {
    status: "success",
    result: {
      id: 465980,
      bidder_id: 25957212,
      project_id: 16296493,
      retracted: false,
      amount: 600,
      period: 3,
      description:
        "Hello\n" +
        "We went through your project description and it seems like our team is a great fit for this job.\n" +
        "We are an expert team which have many years of experience on Job Skills.\n" +
        "Lets connect in chat so that We discuss further.\n" +
        "Thank You",
      project_owner_id: 25955725,
      submitdate: 1714740754,
      buyer_project_fee: null,
      time_submitted: 1714740754,
      highlighted: null,
      sponsored: null,
      milestone_percentage: 50,
      award_status_possibilities: null,
      award_status: null,
      paid_status: null,
      complete_status: null,
      reputation: null,
      time_awarded: null,
      frontend_bid_status: null,
      hireme_counter_offer: null,
      shortlisted: null,
      score: null,
      distance: null,
      negotiated_offer: null,
      hidden: null,
      hidden_reason: null,
      time_accepted: null,
      paid_amount: null,
      hourly_rate: null,
      sealed: false,
      complete_status_changed_time: null,
      award_status_changed_time: null,
      is_location_tracked: null,
      rating: null,
      quotations: null,
      pitch_id: null,
      sales_tax: null,
      profile_id: null,
    },
    request_id: "19fed637c2a7541be46dd570b68a2447",
  };

  console.log("Response:", responseData);
  if (responseData.status !== "error") {
    let dateString = responseData.result.submitdate;
    const date = new Date().toISOString().split("T")[0];
    const newRecord = await Projects.create({
      // Define the fields of the new record
      projectTitle: title,
      bidAmount: responseData.result.amount,
      userName: username,
      time: date,
      user: req.session.user._id,
      // Add more fields as needed
    });
  }
  return res.status(200).json(responseData);
});

router.get("/logout", async (req, res) => {
  delete req.session.user;
  res.redirect("/login");
});
router.get("/emptyRecord", async (req, res) => {
  console.log()
  let id= req.session.user._id;
  
  let updatingStartTime = await Users.findOneAndUpdate(
    { _id: id },
    { $set: { 
      bidStartTime: "",
      bidEndTime:"",
      breakTime:"",
     } },
    { new: true }
  );
});

// router.get("/chatgpt", async (req, res) => {
//   try {
//     const openai = new OpenAI({
//       apiKey: "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",
//     });

//     async function getLocation() {
//       const response = await fetch("https://ipapi.co/json/");
//       const locationData = await response.json();
//       console.log("here is getLocation response data : ",locationData)
//       return locationData;
//     }

//     async function getCurrentWeather(latitude, longitude) {
//       const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=apparent_temperature`;
//       const response = await fetch(url);
//       const weatherData = await response.json();
//       console.log("here is weatherData response data : ",weatherData)
//       return weatherData;
//     }

//     const tools = [
//       {
//         type: "function",
//         function: {
//           name: "getCurrentWeather",
//           description: "Get the current weather in a given location",
//           parameters: {
//             type: "object",
//             properties: {
//               latitude: {
//                 type: "string",
//               },
//               longitude: {
//                 type: "string",
//               },
//             },
//             required: ["longitude", "latitude"],
//           },
//         },
//       },
//       {
//         type: "function",
//         function: {
//           name: "getLocation",
//           description: "Get the user's location based on their IP address",
//           parameters: {
//             type: "object",
//             properties: {},
//           },
//         },
//       },
//     ];

//     const messages = [
//       {
//         role: "system",
//         content:
//           "You are a helpful assistant. Only use the functions you have been provided with.",
//       },
//     ];

//     async function agent(userInput) {
//       messages.push({
//         role: "user",
//         content: userInput,
//       });
//       const response = await openai.chat.completions.create({
//         model: "gpt-3.5-turbo-0125",
//         messages: messages,
//         tools: tools,
//       });
//       // console.log(response);

//       const availableTools = {
//         getCurrentWeather,
//         getLocation,
//       };

//       const { finish_reason, message } = response.choices[0];

//       if (finish_reason === "tool_calls" && message.tool_calls) {
//         const functionName = message.tool_calls[0].function.name;
//         const functionToCall = availableTools[functionName];
//         const functionArgs = JSON.parse(
//           message.tool_calls[0].function.arguments
//         );
//         const functionArgsArr = Object.values(functionArgs);
//         const functionResponse = await functionToCall.apply(
//           null,
//           functionArgsArr
//         );
//         console.log(
//           functionName,
//           functionToCall,
//           JSON.parse(message.tool_calls[0].function.arguments, functionResponse)
//         );
//       }
//     }

//     const response = agent("Where am I located right now?");
//   } catch (error) {
//     console.log(error);
//   }
// });
router.get('/chatgpt', async (req, res) => {
  console.log("req body here : ",req.body)
  try {
    const prompt = req.query.prompt || "Once upon a time in a land far, far away, there was a small village where...";
    const API_KEY =  "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";
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        }
      }
    );

    const reply = response.data.choices[0].message.content;
    res.json({ reply });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "An error occurred while processing your request." });
  }
});

















async function getChatGptResponse(prompt) {
  const API_KEY =process.env.chatGptKey;
  
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        }
      }
    );

    const reply = response.data.choices[0].message.content.trim();
    return reply;
  } catch (error) {
    console.error("Error:", error);
    // throw new Error("An error occurred while processing your request.");
  }
}
// router.post("/admin/resetPassword", isAdmin, async (req, res) => {
//   try {
//     let userId = req.body.userId;
//     console.log("user id ", userId);
//     let enteredNewPassword = "admin@123";
//     const saltRounds = 10;
//     const hashedPassword = await bcrypt.hash(enteredNewPassword, saltRounds);
//     const user = await Users.findOne({ _id: userId });
//     console.log("here is user ", user);

//     if (user) {
//       user.password = hashedPassword;
//       await user.save();
//       console.log("Password updated successfully");
//       res.status(200).send({ message: 'Password reset successfully!' });
//     } else {
//       res.status(404).send({ message: 'User not found.' });
//     }
//   } catch (error) {
//     console.error('Error resetting password:', error);
//     res.status(500).send({ message: 'Error resetting password.' });
//   }
// });
router.post("/admin/resetPassword", isAdmin, async (req, res) => {
  try {
    let userId = req.body.userId;
    console.log("user id ", userId);

    // Function to generate a random 14-character password
    function generateRandomPassword(length) {
      return crypto.randomBytes(length).toString('hex').slice(0, length);
    }

    const newPassword = generateRandomPassword(14); // Generate a 14-character password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    const user = await Users.findOne({ _id: userId });
    console.log("here is user ", user);

    if (user) {
      user.password = hashedPassword;
      await user.save();
      console.log("Password updated successfully");

      // Send the new password to the frontend
      res.status(200).send({ 
        message: 'Password reset successfully!',
        newPassword: newPassword // Include the new password in the response
      });
    } else {
      res.status(404).send({ message: 'User not found.' });
    }
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).send({ message: 'Error resetting password.' });
  }
});

async function processAutoBids() {

    try {
      const usersWithAutoBidOn = await Users.find({ autoBid: true });
      const usersWithAutoBidOnIds = usersWithAutoBidOn.map((user) => user._id);
  
      for (let i = 0; i < usersWithAutoBidOnIds.length; ) {
        console.log("Current user index:", i);
        // Get user ID from session
        const userId = usersWithAutoBidOnIds[i];
  
        // Fetch user details using the user ID
        let user = await Users.findById(userId);
        console.log("user id: ", user._id);
        // Extract access token from user details
        let accessToken = user.access_token;
        let userSkills = user.skills;
        const userSkillsWithValue = userSkills
          .map((skill) => {
            const matchedSkill = allSkills.find((s) => s.tag === skill);
            return matchedSkill ? { skill, value: matchedSkill.value } : null;
          })
          .filter(Boolean);
        const userSkillValues = userSkillsWithValue.map((skill) =>
          Number(skill.value)
        );
        // Extract excluded skills and excluded countries from user details
        let excludedSkills = user.excluded_skills;
        let excludedCountries = user.excluded_countries;
        let clientPaymentVerified = user.payment_verified;
        let clientEmailVerified = user.email_verified;
        let clientDepositMade = user.deposit_made;
        let minimumBudgetFix = parseInt(user.minimum_budget_fixed);
        let minimumBudgetHourly = parseInt(user.minimum_budget_hourly);
  
        // Construct headers with access token
        const headers = { "freelancer-oauth-v1": accessToken };
        let bidEndTime2;
        let brakeTime2;
        console.log("user: ",user)
        if (user.bidEndTime) {
           bidEndTime2 = new Date(user.bidEndTime);
          console.log("Bid End Time:", bidEndTime2);
        }
        if (user.breakTime) {
          brakeTime2 = new Date(user.breakTime);
          console.log("Bid End Time:", brakeTime2);
        }
        let bidsAllowed = user.bidsAllow;
        console.log("bits allowed are", bidsAllowed);
        const currentTime = new Date();
        console.log("user bid end time : ")
        console.log("here is user current time : "+currentTime+" here is user bid end time : "+bidEndTime2)
        console.log("here is user current time : "+currentTime+" here is user break time : "+brakeTime2)
        if (!brakeTime2 || currentTime > brakeTime2) {
        if (!bidEndTime2 || currentTime < bidEndTime2) {
         
          console.log("user bid start time in start : ", user.bidStartTime);
          let updatingStartTime = user.bidStartTime;
          
          if (!user.bidStartTime) {
            const currentTime2 = new Date();
            const updatedUser = await Users.findOneAndUpdate(
              { _id: user._id },
              { $set: { bidStartTime: currentTime2 } },
              { new: true }
            );
            updatingStartTime = updatedUser.bidStartTime;
          }
          
          let firstBrakeTime;
          if (updatingStartTime) {
            const timeInterval = parseInt(user.timeInterval);
            if (timeInterval === 1) {
              timeInterval = 2;
            }
            let timeIntervalMilliseconds = timeInterval * 60000;
            console.log("bidStart time: ", updatingStartTime);
            // Add the time limit in minutes to the bid start time
           firstBrakeTime = new Date(updatingStartTime.getTime() + timeIntervalMilliseconds + 2000);
          }
          
          if (!user.breakTime && firstBrakeTime) {
            await Users.findOneAndUpdate(
              { _id: user._id },
              { $set: { breakTime: firstBrakeTime } },
              { new: true }
            );
          } else if (user.breakTime) {
            let timeInterval = parseInt(user.timeInterval);

            // Check if user.timeInterval is 1, if so, make it 1.5
            if (timeInterval === 1) {
              timeInterval = 2;
            }
            const secondBrakeTime = new Date(user.breakTime.getTime() + timeInterval * 60000);
            await Users.findOneAndUpdate(
              { _id: user._id },
              { $set: { breakTime: secondBrakeTime } },
              { new: true }
            );
          }
                         
                          if (bidsAllowed > 0) {
                            // API endpoint for fetching projects
                            const url = "https://freelancer.com/api/projects/0.1/projects/all/";
                  
                            // Parameters for the API request
                            const params = {
                              jobs: userSkillValues,
                              min_avg_price: 10,
                              project_statuses: ["active"],
                              full_description: true,
                              job_details: true,
                              user_details: true,
                              location_details: true,
                              user_status: true,
                              user_reputation: true,
                              user_country_details: true,
                              user_display_info: true,
                              user_membership_details: true,
                              user_financial_details: true,
                              compact: true,
                            };
                  
                            // Make request to fetch projects
                            const response = await axios.get(url, {
                              params: params,
                              headers: headers,
                            });
                  
                            // Process response data
                            const responseData = response.data;
                            const projects = responseData.result.projects;
                  
                            // Extract user details for project owners
                            const ownerIds = projects.map((project) => project.owner_id);

                            const projectsDetails = await Promise.all(
                              ownerIds.map(async (ownerId) => {
                                if (!isNaN(ownerId)) {
                                  try {
                                    const ownerUrl = `https://freelancer.com/api/users/0.1/users/${ownerId}/`;
                                    const ownerResponse = await axios.get(ownerUrl, {
                                      params: {
                                        jobs: true,
                                        reputation: true,
                                        employer_reputation: true,
                                        reputation_extra: true,
                                        employer_reputation_extra: true,
                                        job_ranks: true,
                                        staff_details: true,
                                        completed_user_relevant_job_count: true,
                                      },
                                      headers: headers,
                                    });
                                    return ownerResponse.data.result;
                                  } catch (error) {
                                    if (error.response && error.response.status === 404) {
                                      console.error(`User with ownerId ${ownerId} not found.`);
                                      return null; // Handle 404 error gracefully
                                    } else {
                                      console.error(`Error fetching user details for ownerId ${ownerId}:`, error);
                                      throw error; // Rethrow other errors to handle them later
                                    }
                                  }
                                } else {
                                  return null;
                                }
                              })
                            );
                          
                            const projects2 = responseData.result.projects.map((project, index) => ({
                              projectid: project.id,
                              type: project.type,
                              description: project.description,
                              title: project.title,
                              currencyName: project.currency.name,
                              currencySign: project.currency.sign,
                              bidCount: project.bid_stats.bid_count,
                              bidAverage: project.bid_stats.bid_avg,
                              jobNames: project.jobs.map((job) => job.name),
                              minimumBudget: project.budget.minimum,
                              maximumBudget: project.budget.maximum,
                              country: project.location.country.flag_url,
                              fullName: projectsDetails[index]?.username,
                              displayName: projectsDetails[index]?.public_name,
                              ownerCountry: projectsDetails[index]?.location?.country?.name,
                              payment: projectsDetails[index]?.status?.payment_verified,
                              email: projectsDetails[index]?.status?.email_verified,
                              deposit_made: projectsDetails[index]?.status?.deposit_made,
                              identity_verified: projectsDetails[index]?.status?.identity_verified,
                              countryShortName: projectsDetails[index]?.timezone?.country,
                              currencyCode: project.currency.code,
                            }));
                  
                            const filteredProjects2 = projects2.filter((project) => {
                              // Convert project's countryShortName to lowercase for case-insensitive comparison
                              const projectCountry = project.countryShortName
                                ? project.countryShortName.toLowerCase()
                                : "";
                  
                              // Check if project's countryShortName matches any excluded country (case-insensitive)
                              if (
                                excludedCountries.some(
                                  (country) => country.toLowerCase() === projectCountry
                                )
                              ) {
                                return false; // Exclude project
                              }
                  
                              // Check if project's jobNames include any excluded skill (case-insensitive)
                              if (
                                project.jobNames.some((skill) =>
                                  excludedSkills.includes(skill.toLowerCase())
                                )
                              ) {
                                return false; // Exclude project
                              }
                  
                              // Check if clientPaymentVerified is 'yes'
                              if (clientPaymentVerified == "yes" && project.payment == null) {
                                return false; // Exclude project
                              }
                  
                              // Check if clientEmailVerified is 'yes'
                              if (clientEmailVerified == "yes" && project.email !== true) {
                                return false; // Include project
                              }
                  
                              // Check if clientDepositMade is 'yes'
                              if (clientDepositMade == "yes" && project.deposit_made == null) {
                                return false; // Exclude project
                              }
                  
                              // Additional filters based on project type (fixed or hourly)
                              if (
                                project.type == "fixed" &&
                                project.minimumBudget <= minimumBudgetFix
                              ) {
                                return false; // Exclude project
                              }
                  
                              if (
                                project.type == "hourly" &&
                                project.minimumBudget <= minimumBudgetHourly
                              ) {
                                return false; // Exclude project
                              }
                  
                              return true; // Include project
                            });
                  
                            const templates = await Templates.find({ userId: userId }).populate(
                              "category"
                            );
                  
                            console.log("here are templates------>", templates);
                  
                            // Function to randomly decide inclusion for templates with always_include = false
                            const randomlyInclude = (probability) => Math.random() < probability;
                            
                            // Filter templates by category, deciding randomly for always_include = false
                            const filteredTemplates = templates.filter((template) => {
                              if (template.category && template.category.always_include === true) {
                                console.log(`Including template: ${template._id} (always_include = true)`);
                                return true; // Always include
                              } else if (template.category && template.category.always_include === false) {
                                const include = randomlyInclude(0.5); // 50% chance to include
                                console.log(`Template: ${template._id} (always_include = false) included: ${include}`);
                                return include;
                              }
                              console.log(`Excluding template: ${template._id} (category not defined or always_include not specified)`);
                              return false; // Exclude if category is not defined or always_include is not specified
                            });
                            
                            // Group and sort filteredTemplates by category position
                            const groupedAndSortedTemplates = filteredTemplates.reduce((acc, template) => {
                              const categoryId = template.category._id.toString();
                              if (!acc[categoryId]) {
                                acc[categoryId] = {
                                  position: template.category.position,
                                  templates: [],
                                };
                              }
                              acc[categoryId].templates.push(template);
                              return acc;
                            }, {});
                            
                            // Convert object to array and sort by position
                            const sortedCategories = Object.values(groupedAndSortedTemplates).sort(
                              (a, b) => a.position - b.position
                            );
                            console.log(sortedCategories);
                            
                            // Function to get final content from templates for a project
                            const getFinalContentForProject = (project, templates, ownerName, userSkills) => {
                              return templates.reduce((acc, category) => {
                                const randomTemplateIndex = Math.floor(Math.random() * category.templates.length);
                                const selectedTemplate = category.templates[randomTemplateIndex];
                                const matchingSkills = project.jobNames.filter(jobName => userSkills.includes(jobName));
                            
                                const replacedContent = selectedTemplate.content
                                  .replace(/{{Project Title}}/g, project.title)
                                  .replace(/{{Owner Name}}/g, ownerName)
                                  .replace(/{{Owner Full Name}}/g, project.displayName)
                                  .replace(/{{Matching Job Skills}}/g, matchingSkills.join(", "))
                                  .replace(/{{Job Skills}}/g, userSkills.slice(0, 5).join(", "))
                                  .replace(/{{Owner First Name}}/g, ownerName.split(" ")[0] || ownerName)
                                  .replace(/{{Country}}/g, project.ownerCountry)
                                  .replace(/{{NewLine}}/g, "\n");
                            
                                return acc + replacedContent + "\n"; // Add a newline after each template
                              }, "");
                            };

                                      console.log("Here is user just before making content: ", user);
                                      const userSkills = user.skills;
                                      const filteredProjectDetails = filteredProjects2.map((project) => {
                                        const ownerName = project.fullName || project.displayName || "";
                                        const finalContent = getFinalContentForProject(
                                          project,
                                          sortedCategories,
                                          ownerName,
                                          userSkills
                                        );

                                        return {
                                          projectid: project.projectid,
                                          currencyCode:project.currencyCode,
                                          type:project.type,
                                          title: project.title,
                                          bidAverage: project.bidAverage,
                                          minimumBudget: project.minimumBudget,
                                          maximumBudget: project.maximumBudget,
                                          fullName: project.fullName,
                                          displayName: project.displayName,
                                          jobNames: project.jobNames,
                                          description: finalContent,
                                          projectDescription:project.description,
                                          bidderName:user.username,
                                          bidderskills:user.skills,
                                        };
                                      });
                  
                            // console.log(
                            //   "Final project details with descriptions:",
                            //   filteredProjectDetails
                            // );
                            const numBids = Math.min(bidsAllowed, user.bidsLimit);
                  
                            const currentTime = new Date();
                            const timeLimitInMinutes = parseInt(user.timeLimit);
                            let userNew = await Users.findById(userId);
                            // Add the time limit in minutes to the current time
                            console.log("after new time : ",userNew.bidStartTime,timeLimitInMinutes)
                            const bidEndTime = new Date(userNew.bidStartTime.getTime() + timeLimitInMinutes * 60000);
                            let whenToStop = new Date(userNew.bidEndTime).getTime();
                            let latestTime = Date.now();
                  
                            if (isIntervalHit(user.bidStartTime, user.timeInterval)) {
                              for (let i = 0; i < filteredProjectDetails.length; i++) {
                                const project = filteredProjectDetails[i];
                              console.log("here is project", project);
                              const extractedData = {
                                title: project.title,
                                jobNames: project.jobNames,
                                projectDescription: project.projectDescription,
                                myName: project.bidderName,
                                mySkills:project.bidderskills,
                                clientName:project.fullName,
                                clientDisplayName:project.displayName,
                                currencyCode:project.currencyCode,
                                type:project.type,
                                minimumBudget:project.minimumBudget,
                                maximumBudget:project.maximumBudget,
                                bidAverage:project.bidAverage,
                              };
                              console.log("extrected data: ",extractedData)
                              console.log("user ai bid value : ",user.aiBid)
                              if(user.aiBid){
                              const prompt = `I am providing examples of proposals to guide the tone and structure for this task:
                              EXAMPLE 1
                              As a seasoned cryptocurrency and technology enthusiast with over five years of experience in fields such as Bitcoin, Mobile Applications, and PHP, I am confident that I am the ideal candidate for this urgent project. My expertise in Android/iOS app development, web and mobile application design—from E-commerce to Cryptocurrencies—allows me to offer an innovative and effective Social Media Engagement and Cryptocurrency Performance web application.
                              
                              With extensive experience in developing Social Networking apps, Mobile Ads integration, E-learning tools, and more, I excel at understanding clients' needs and delivering exceptional results. Expect consistent communication, reliable support, and detailed status reports. Partnering with me means your project will be handled with professionalism and expertise. Thank you!
                              
                              EXAMPLE 2
                              My name is Stelian, and I am a full-stack developer with over a decade of experience. I've built numerous applications using various technical stacks, with extensive work in C# and JavaScript—key languages for your project.
                              
                              In addition to my C# programming skills, I have a strong background in Windows desktop environments. My experience aligns perfectly with decrypting and modifying complex programs. Though I may not have access to specific codes, my expertise in debugging and reverse engineering will be instrumental. My familiarity with AWS deployment and Linux System Administration further enhances my ability to optimize project performance and security.
                              
                              Now, keeping these examples in mind, please create a proposal for a project I found on Freelancer.com. Here are the details:
                              Title of project: ${extractedData.title}
                              skills which are required for project: ${extractedData.jobNames}
                              Description of project: ${extractedData.projectDescription}
                              Client name who posted it : ${extractedData.clientName || extractedData.clientDisplayName}
                               My Name: ${extractedData.myName}
                               My Skills: ${extractedData.mySkills}
                              
                              Write a proposal that follows the structure and tone of the provided examples. The proposal should be written in a conversational, human-like manner, not exceed 200 words, and include a closing statement inviting further discussion. Provide only the main body of the proposal, starting with the greeting and ending with the closing statement, without including the title or other details.`;
                                const result = await getChatGptResponse(prompt);
                                
                                if (result) {
                                  console.log(" chat 3 ",result)
                                  project.description = result; // Replace project description with the generated proposal
                                }
                                
                              }
                              // Extract project details
                              const {
                                projectid,
                                minimumBudget,
                                maximumBudget,
                                description,
                                bidAverage,
                                title,
                                fullName,
                                currencyCode,
                                type
                              } = project;
                             
                            const filterObject = await Biddingprice.findOne({ user: user._id });
                            
                            
                              let bidderid = parseInt(user.id);
                              let projectID = parseInt(projectid);
                           

                            const currencyMap = {
                              USD: 'usd_aud_cad',
                              AUD: 'usd_aud_cad',
                              CAD: 'usd_aud_cad',
                              GBP: 'gbp',
                              EUR: 'eur',
                              INR: 'inr',
                              SGD: 'nzd_sgd',
                              NZD: 'nzd_sgd',
                              HKD: 'hkd'
                            };
                            const bidValue = getBidValue(project, filterObject, user);
                              console.log("project: ", project);
                              console.log("filterObject :", filterObject);
                              console.log("user :", user);
                              console.log("Bidder ID:", bidderid);
                              console.log("Project ID:", projectID);
                              console.log("maximum Money:", maximumBudget);
                              console.log("Bid Money:", bidValue);
                              console.log("project Description: ", description);
                              // Prepare the bid request body
                              const bidRequestBody = {
                                project_id: projectID,
                                bidder_id: bidderid,
                                amount: bidValue,
                                period: 3,
                                milestone_percentage: 50,
                                description: description,
                              };
                  
                              
                                // Make the POST request to Freelancer API
                                const response = await fetch(
                                  `https://www.freelancer.com/api/projects/0.1/bids/`,
                                  {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                      "freelancer-oauth-v1": accessToken,
                                    },
                                    body: JSON.stringify(bidRequestBody),
                                  }
                                );
                  
                                // Parse the JSON response
                                const responseData = await response.json();
                  
                                // Log response
                                console.log("Bid Response: ", responseData);
                                if( responseData.error_code === "ProjectExceptionCodes.DUPLICATE_BID")
                                  {
                                    console.log("Already bid on this project. Trying the next one...");
                                    continue;
                                  }else{
                                    console.log("User Id :", user._id);
                                    if (responseData.status == "error") {
                                      const date = new Date().toISOString().split("T")[0];
                                      const newRecord = await Projects.create({
                                        // Define the fields of the new record
                                        bidDescription: responseData.message,
                                        projectTitle: project.title,
                                        bidAmount: bidValue,
                                        userName: project.fullName,
                                        status: 1,
                                        time: date,
                                        user: user._id,
                                        // Add more fields as needed
                                      });
                                      await Users.updateOne(
                                                    { _id: user._id },
                                                    { 
                                                      $inc: { 
                                                        bidsAllow: -1, 
                                                        bidsLimit: -1 
                                                      } 
                                                    }
                                                  );
                      
                                      if (user.bidsLimit <= 0) {
                                        let updatingAutoBid = await Users.findOneAndUpdate(
                                          { _id: user._id },
                                          { $set: { autoBid: false } }, // Update operation to set the `bidStartTime` field
                                          { new: true } // Option to return the updated document
                                        );
                                      }
                                     
                                      console.log("bidEndTime on project FAILED: ",user.bidEndTime)
                                      console.log("bidEndTime on project FAILED which was calculated: ",bidEndTime)

                                      if(!user.bidEndTime){
                                      let updatingStartTime = await Users.findOneAndUpdate(
                                        { _id: user._id },
                                        {
                                          $set: { bidStartTime: currentTime, bidEndTime: bidEndTime },
                                        },
                                        { new: true }
                                      );
                                    }
                                      // Decrease bidsAllowed by 1 for the user if bid was successful
                                    }
                      
                                    if (responseData.status !== "error") {
                                      let dateString = responseData.result.submitdate;
                                      const date = new Date().toISOString().split("T")[0];
                                      const newRecord = await Projects.create({
                                        // Define the fields of the new record
                                        bidDescription: description,
                                        projectTitle: title,
                                        bidAmount: responseData.result.amount,
                                        userName: fullName,
                                        time: date,
                                        user: user._id,
                                        // Add more fields as needed
                                      });
                                      // Decrease bidsAllowed by 1 for the user if bid was successful
                                      bidsAllowed = bidsAllowed - 1;
                      
                                      await Users.updateOne(
                                        { _id: user._id },
                                                    { 
                                                      $inc: { 
                                                        bidsAllow: -1, 
                                                        bidsLimit: -1 
                                                      } 
                                                    }
                                      );
                      
                                      if (user.bidsLimit <= 0) {
                                        let updatingAutoBid = await Users.findOneAndUpdate(
                                          { _id: user._id },
                                          { $set: { autoBid: false } }, // Update operation to set the `bidStartTime` field
                                          { new: true } // Option to return the updated document
                                        );
                                      }
                                    
                                      console.log("bidEndTime on project success: ",user.bidEndTime)
                                      console.log("bidEndTime on project success which was calculated: ",bidEndTime)
                                      if(!user.bidEndTime){
                                      let updatingStartTime = await Users.findOneAndUpdate(
                                        { _id: user._id },
                                        {
                                          $set: { bidStartTime: currentTime, bidEndTime: bidEndTime },
                                        },
                                        { new: true }
                                      );
                                    }
                                    }
                                    break;
                                  }
              
               
              } 
            } else {
              console.log("is interval hit return false");
            }
          }
  
          console.log("updating time", user._id);
        } else {
          console.log(
            "setting auto bid off and end and start date empty for user fo user: ",user._id
          );
          let updatingAutoBid = await Users.findOneAndUpdate(
            { _id: user._id },
            {
              $set: {
                autoBid: false,
                bidEndTime: null,
                bidStartTime: null,
                breakTime: null,
              },
            },
            { new: true } // Option to return the updated document
          );
        }}
        console.log("Moving to the next user...");
        i++;
      }
      console.log("all users done");
      return "Processing complete for all users with autoBid on";
    } catch (error) {
      console.error("Error occurred:", error);
      throw error;
    }
  };
  
  
// Function to calculate a fallback bid
function calculateFallbackBid(bidAverage, minimumBudget, maximumBudget, user) {
  let averageBid = parseInt(bidAverage);
  let lowRange = parseInt(user.lower_bid_range);
  let highRange = parseInt(user.higher_bid_range);
  const lowerValue = averageBid * (lowRange / 100);
  const higherValue = averageBid * (highRange / 100);
  let smallValue = averageBid - lowerValue;
  let largeValue = averageBid + higherValue;
  let randomValue = parseFloat((smallValue + Math.random() * (largeValue - smallValue)).toFixed(2));
  let bidMoney;
  if (maximumBudget) {
    bidMoney = parseInt(maximumBudget * 0.7);
  } else {
    bidMoney = parseInt(randomValue);
  }
  if (isNaN(bidMoney) || lowRange == 0 || highRange == 0) {
    bidMoney = parseFloat(averageBid);
  }
  return bidMoney;
}

// Function to determine the category of the project
function determineCategory(project, filterObject) {
  if (!filterObject) {
    console.error("filterObject is null or undefined");
    return null;
  }

  const { minimumBudget, currencyCode } = project;

  // Select filters based on project type
  let filters;

  if (project.type === "fixed") {
    filters = {
      micro_project: filterObject.micro_project,
      simple_project: filterObject.simple_project,
      very_small_project: filterObject.very_small_project,
      small_project: filterObject.small_project,
      large_project: filterObject.large_project
    };
  } else if (project.type === "hourly") {
    filters = {
      basic_hourly: filterObject.basic_hourly,
      moderate_hourly: filterObject.moderate_hourly,
      standard_hourly: filterObject.standard_hourly,
      skilled_hourly: filterObject.skilled_hourly
    };
  }

  console.log("filters: ", filters);
  let pricetocompare;
  console.log(`Filters available: ${Object.keys(filters).join(', ')}`);

  for (let [key, filter] of Object.entries(filters)) {
    if (!filter) {
      console.warn(`Filter for ${key} is not defined`);
      continue;
    }
    
    const budgetType = filter.budget || filter.rate;
    if (budgetType === "lowest") {
      pricetocompare = minimumBudget;
    } else if (budgetType === "average") {
      pricetocompare = project.bidAverage;
    } else if (budgetType === "highest") {
      pricetocompare = project.maximumBudget;
    }

    const currencyKey = currencyCode.toLowerCase();
    const budgetRangeKey = `budget_range_${currencyKey}`;
    if (filter[budgetRangeKey]) {
      const [low, high] = filter[budgetRangeKey].split('-').map(Number);
      if (pricetocompare >= low && pricetocompare < high) {
        console.log(`Project falls under ${key} category with range ${low}-${high}`);
        return key; // Return the category key
      }
    }
  }
  console.log('No valid category found');
  return null; // Return null if no category is found
}

// Function to get bid value based on project and filters
function getBidValue(project, filterObject, user) {
  if (!filterObject) {
    console.error("filterObject is null or undefined");
    return calculateFallbackBid(project.bidAverage, project.minimumBudget, project.maximumBudget, user);
  }

  const { currencyCode } = project;

  // Determine the category of the project
  const category = determineCategory(project, filterObject);
  console.log(`Determined category: ${category}`);

  if (category) {
    const filter = filterObject[category];
    if (!filter) {
      console.error(`No filter found for category: ${category}`);
      return calculateFallbackBid(project.bidAverage, project.minimumBudget, project.maximumBudget, user);
    }

    const budgetType = filter.budget || filter.rate;
    let pricetocompare;
    if (budgetType === "lowest") {
      pricetocompare = project.minimumBudget;
    } else if (budgetType === "average") {
      pricetocompare = project.bidAverage;
    } else if (budgetType === "highest") {
      pricetocompare = project.maximumBudget;
    }

    const currencyKey = currencyCode.toLowerCase();
    const budgetRangeKey = `budget_range_${currencyKey}`;
    if (filter[budgetRangeKey]) {
      const [low, high] = filter[budgetRangeKey].split('-').map(Number);
      if (pricetocompare >= low && pricetocompare < high) {
        const bidKey = `bid_${currencyKey}`;
        let bidValue = filter[bidKey];
        console.log(`Bid value from filter: ${bidValue}`);
        if (bidValue === 0 || bidValue === null) {
          const fallbackBid = calculateFallbackBid(project.bidAverage, project.minimumBudget, project.maximumBudget, user);
          console.log(`Fallback bid value: ${fallbackBid}`);
          return fallbackBid;
        }
        return bidValue;
      }
    }
  }

  // Use fallback logic if no valid bid value found in filters
  const fallbackBid = calculateFallbackBid(project.bidAverage, project.minimumBudget, project.maximumBudget, user);
  console.log(`Fallback bid value used: ${fallbackBid}`);
  return fallbackBid;
}

// router.get("/test", async (req, res) => {
//   try {
//     const usersWithAutoBidOn = await Users.find({ autoBid: true });
//     const usersWithAutoBidOnIds = usersWithAutoBidOn.map(user => user._id);

//     for (let i = 0; i < usersWithAutoBidOnIds.length; i++) {
//       console.log("Current user index:", i);

//       const userId = usersWithAutoBidOnIds[i];
//       const user = await Users.findById(userId);
//       console.log("user id:", user._id);
//       console.log("user : ", user);

//       const {
//         access_token: accessToken,
//         skills: userSkills,
//         excluded_skills: excludedSkills,
//         excluded_countries: excludedCountries,
//         payment_verified: clientPaymentVerified,
//         email_verified: clientEmailVerified,
//         deposit_made: clientDepositMade,
//         minimum_budget_fixed: minimumBudgetFix,
//         minimum_budget_hourly: minimumBudgetHourly,
//         bidsAllow:bidsAllowed,
//         timeLimit,
//         bidEndTime,
//         bidsLimit,
//         autoBid,
//         bidStartTime,
//         lower_bid_range: lowRange,
//         higher_bid_range: highRange,
//         id: bidderid
//       } = user;

//       const userSkillsWithValue = userSkills
//         .map(skill => {
//           const matchedSkill = allSkills.find(s => s.tag === skill);
//           return matchedSkill ? { skill, value: matchedSkill.value } : null;
//         })
//         .filter(Boolean);

//       const userSkillValues = userSkillsWithValue.map(skill => Number(skill.value));

//       const headers = { "freelancer-oauth-v1": accessToken };
//       const currentTime = new Date().toISOString();

//       if (!bidEndTime || currentTime < bidEndTime) {
//         if (bidsAllowed > 0) {
//           const url = "https://freelancer.com/api/projects/0.1/projects/all/";
//           const params = {
//             jobs: userSkillValues,
//             min_avg_price: 10,
//             project_statuses: ["active"],
//             full_description: true,
//             job_details: true,
//             user_details: true,
//             location_details: true,
//             user_status: true,
//             user_reputation: true,
//             user_country_details: true,
//             user_display_info: true,
//             user_membership_details: true,
//             user_financial_details: true,
//             compact: true
//           };

//           const response = await axios.get(url, { params, headers });
//           const projects = response.data.result.projects;

//           const ownerIds = projects.map(project => project.owner_id);
//           const projectsDetails = await Promise.all(
//             ownerIds.map(async ownerId => {
//               if (!isNaN(ownerId)) {
//                 const ownerUrl = `https://freelancer.com/api/users/0.1/users/${ownerId}/`;
//                 const ownerResponse = await axios.get(ownerUrl, {
//                   jobs: true,
//                   reputation: true,
//                   employer_reputation: true,
//                   reputation_extra: true,
//                   employer_reputation_extra: true,
//                   job_ranks: true,
//                   staff_details: true,
//                   completed_user_relevant_job_count: true,
//                   headers
//                 });
//                 return ownerResponse.data.result;
//               } else {
//                 return null;
//               }
//             })
//           );

//           const filteredProjects = projects.map((project, index) => ({
//             projectid: project.id,
//             type: project.type,
//             description: project.description,
//             title: project.title,
//             currencyName: project.currency.name,
//             currencySign: project.currency.sign,
//             bidCount: project.bid_stats.bid_count,
//             bidAverage: project.bid_stats.bid_avg,
//             jobNames: project.jobs.map(job => job.name),
//             minimumBudget: project.budget.minimum,
//             maximumBudget: project.budget.maximum,
//             country: project.location.country.flag_url,
//             fullName: projectsDetails[index]?.username,
//             displayName: projectsDetails[index]?.public_name,
//             ownerCountry: projectsDetails[index]?.location?.country?.name,
//             payment: projectsDetails[index]?.status?.payment_verified,
//             email: projectsDetails[index]?.status?.email_verified,
//             deposit_made: projectsDetails[index]?.status?.deposit_made,
//             identity_verified: projectsDetails[index]?.status?.identity_verified,
//             countryShortName: projectsDetails[index]?.timezone?.country
//           }));

//           const filteredProjects2 = filteredProjects.filter(project => {
//             const projectCountry = project.countryShortName ? project.countryShortName.toLowerCase() : "";

//             if (excludedCountries.some(country => country.toLowerCase() === projectCountry)) return false;
//             if (project.jobNames.some(skill => excludedSkills.includes(skill.toLowerCase()))) return false;
//             if (clientPaymentVerified === "yes" && !project.payment) return false;
//             if (clientEmailVerified === "yes" && !project.email) return false;
//             if (clientDepositMade === "yes" && !project.deposit_made) return false;
//             if (project.type === "fixed" && project.minimumBudget <= minimumBudgetFix) return false;
//             if (project.type === "hourly" && project.minimumBudget <= minimumBudgetHourly) return false;

//             return true;
//           });

//           const templates = await Templates.find({ userId }).populate("category");

//           const randomlyInclude = probability => Math.random() < probability;

//           const filteredTemplates = templates.filter(template => {
//             if (template.category?.always_include === true) return true;
//             if (template.category?.always_include === false) return randomlyInclude(0.5);
//             return false;
//           });

//           const groupedAndSortedTemplates = filteredTemplates.reduce((acc, template) => {
//             const categoryId = template.category._id.toString();
//             if (!acc[categoryId]) {
//               acc[categoryId] = { position: template.category.position, templates: [] };
//             }
//             acc[categoryId].templates.push(template);
//             return acc;
//           }, {});

//           const sortedCategories = Object.values(groupedAndSortedTemplates).sort((a, b) => a.position - b.position);

//           const getFinalContentForProject = (project, templates, ownerName) => {
//             return templates.reduce((acc, category) => {
//               const randomTemplateIndex = Math.floor(Math.random() * category.templates.length);
//               const selectedTemplate = category.templates[randomTemplateIndex];

//               const replacedContent = selectedTemplate.content
//                 .replace(/{{Project Title}}/g, project.title)
//                 .replace(/{{Owner Name}}/g, ownerName)
//                 .replace(/{{Owner Full Name}}/g, project.displayName)
//                 .replace(/{{Job Skills}}/g, user.skills)
//                 .replace(/{{Matching Job Skills}}/g, project.jobNames.join(", "))
//                 .replace(/{{Matching Job Skills}}/g, project.jobNames.join(", "))
//                 .replace(/{{Owner First Name}}/g, ownerName.split(" ")[0] || ownerName)
//                 .replace(/{{Country}}/g, project.ownerCountry) + "\n";

//               return acc + replacedContent;
//             }, "");
//           };

//           const filteredProjectDetails = filteredProjects2.map(project => {
//             const ownerName = project.fullName || project.displayName || "";
//             const finalContent = getFinalContentForProject(project, sortedCategories, ownerName);

//             return {
//               projectid: project.projectid,
//               title: project.title,
//               bidAverage: project.bidAverage,
//               minimumBudget: project.minimumBudget,
//               maximumBudget: project.maximumBudget,
//               fullName: project.fullName,
//               displayName: project.displayName,
//               jobNames: project.jobNames,
//               description: finalContent
//             };
//           });

//           console.log("Final project details with descriptions:", filteredProjectDetails);
//           const numBids = Math.min(bidsAllowed, bidsLimit);

//           const newTime = new Date(Date.now() + timeLimit * 60000);

//           if (isIntervalHit(bidStartTime, user.timeInterval)) {
//             const project = filteredProjectDetails[0];
//             console.log("here is project", project);

//             const { projectid, bidAverage, description, title, fullName } = project;
//             const averageBid = parseInt(bidAverage);
//             const lowerValue = averageBid * (lowRange / 100);
//             const higherValue = averageBid * (highRange / 100);
//             const smallValue = averageBid - lowerValue;
//             const largeValue = averageBid + higherValue;
//             const randomValue = parseFloat((smallValue + Math.random() * (largeValue - smallValue)).toFixed(2));

//             console.log("Random Value:---->", randomValue);

//             const bidMoney = isNaN(randomValue) || lowRange == 0 || highRange == 0 ? averageBid : randomValue;

//             const bidRequestBody = {
//               project_id: Number(projectid),
//               bidder_id: Number(bidderid),
//               amount: bidMoney,
//               period: 3,
//               milestone_percentage: 50,
//               description
//             };

//             try {
//               const bidResponse = await fetch(
//                 `https://www.freelancer.com/api/projects/0.1/bids/`,
//                 {
//                   method: "POST",
//                   headers: {
//                     "Content-Type": "application/json",
//                     "freelancer-oauth-v1": accessToken
//                   },
//                   body: JSON.stringify(bidRequestBody)
//                 }
//               );

//               const responseData = await bidResponse.json();
//               console.log("Bid Response:", responseData);

//               if (responseData.status != "error") {
//                 console.log("user id from status ok : ",user._id)
//                 await Projects.create({
//                   bidDescription: description,
//                   projectTitle: title,
//                   bidAmount: responseData.result.amount,
//                   userName: fullName,
//                   time: new Date().toISOString().split("T")[0],
//                   user: user._id
//                 });

//                 await Users.updateOne({ _id: user._id }, { $inc: { bidsAllow: -1 } });
               
//                 console.log("bid limits: ",bidsLimit)
//                 if (bidsLimit <= 0) {
//                   await Users.findOneAndUpdate(
//                     { _id: user._id },
//                     { $set: { autoBid: false } },
//                     { new: true }
//                   );
//                 }

//                 await Users.findOneAndUpdate(
//                   { _id: user._id },
//                   { $set: { bidStartTime: currentTime, bidEndTime: newTime } },
//                   { new: true }
//                 );
//               }
//             } catch (error) {
//               console.error("Error occurred while sending bid:", error);
//             }
//           } else {
//             console.log("is interval hit return false");
//           }
//         }

//         console.log("Moving to the next user...");
//       } else {
//         console.log("setting auto bid off and end and start date empty for user");
//         await Users.findOneAndUpdate(
//           { _id: user._id },
//           { $set: { autoBid: false, bidEndTime: "", bidStartTime: "" } },
//           { new: true }
//         );
//       }
//     }

//     console.log("all users done");
//     res.status(200).send("Processing complete for all users with autoBid on");
//   } catch (error) {
//     console.error("Error occurred:", error);
//     return res.status(500).json({ error: "Internal Server Error" });
//   }
// });


router.get("/api/projects", sessionChecker, async (req, res) => {
  try {
    const dateString = req.query.date;
    const date = new Date(dateString); // Parse the date string

    // Construct the start and end dates to cover the entire selected day in UTC
    const startDate = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    );
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 1); // Move to the next day in UTC
    const userId = req.session.user._id;

    console.log(
      "Start date and end date:",
      startDate.toISOString(),
      endDate.toISOString()
    );
    // Query projects within the date range
    const projects = await Projects.find({
      time: {
        $gte: startDate,
        $lt: endDate,
      },
      user: userId,
    });

    console.log("Number of projects found:", projects.length);
    projects.forEach((project) => {
      // Replace newline characters in the bidDescription field with a space
      project.bidDescription = project.bidDescription.replace(/\n/g, " ");
    });
    console.log("Projects:", projects);

    res.json(projects);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
});
router.get("/locked", async (req, res) => {
  if (req.session.user) {
    delete req.session.user;
  }
  res.render("locked");
});
router.post("/getBonus", async (req, res) => {
  try {
    let userId = req.session.user._id;
    let user = await Users.findOne({ _id: userId });

    // Check if user's email and phone are null
    if (!user.email && !user.phone) {
      // Update user's email and phone
      user.email = req.body.email;
      user.phone = req.body.phone;
      user.bidsAllow += 50;
      user.subscriptionEndDate.setDate(user.subscriptionEndDate.getDate() + 2);
      // Save the updated user
      await user.save();
      console.log("updated user here------>", user);
      // Send success response to frontend
      res
        .status(200)
        .json({
          message: "User information updated successfully.You got your bonus",
        });
    } else {
      // Send sorry message to frontend
      res
        .status(400)
        .json({ message: "We're sorry, user information cannot be updated." });
    }
  } catch (error) {
    console.error("Error updating user information:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});
router.get("/createAdmin", async (req, res) => {
  let name = "defaultAdmin";
  let password = "$2b$10$VqrP..e.5Sh.NOH0ZNlcmeinLl6iNGkdji6p17ucpq1hGBE680n56";
  const newUser = await Users.create({
    username: name,
    password: password,
    isAdmin: true,
  });
});
router.get("/deleteuser", async (req, res) => {
  try {
    // Delete all users
    const result = await Users.deleteMany({});

    if (result.deletedCount === 0) {
      console.log("No users to delete");
      res.send("No users to delete");
    } else {
      console.log(`${result.deletedCount} users deleted`);
      res.send(`${result.deletedCount} users deleted`);
    }
  } catch (err) {
    console.error("Error deleting users:", err);
    res.status(500).send("Error deleting users");
  }
});
router.post("/deleteuserbyid", async (req, res) => {
  try {
    let id = req.body.id;

    // Validate the ID (you may want to use a more robust validation method)
    if (!id) {
      return res.status(400).send("User ID is required");
    }

    // Delete the user by ID
    const result = await Users.deleteOne({ _id: id });

    if (result.deletedCount === 0) {
      console.log("No user found with the given ID");
      res.send("No user found with the given ID");
    } else {
      console.log(`User with ID ${id} deleted`);
      res.send(`User with ID ${id} deleted`);
    }
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).send("Error deleting user");
  }
});
router.get("/deleteProjectBiding", async (req, res) => {
  try {
    // Delete all users
    const result = await Biddingprice.deleteMany({});

    if (result.deletedCount === 0) {
      console.log("No users to delete");
      res.send("No users to delete");
    } else {
      console.log(`${result.deletedCount} users deleted`);
      res.send(`${result.deletedCount} users deleted`);
    }
  } catch (err) {
    console.error("Error deleting users:", err);
    res.status(500).send("Error deleting users");
  }
});

router.get("/admin/changePricing", isAdmin, async (req, res) => {
  const pricing = await Payments.find({});

  res.render("adminPricing", { pricing });
});
router.post("/admin/changePricing", isAdmin, async (req, res) => {
  const paymentData = req.body;
  console.log("paymentData: ", paymentData);
  if (Array.isArray(paymentData.nonIndianYearlyLink)) {
    paymentData.nonIndianYearlyLink =
      paymentData.nonIndianYearlyLink.join(", "); // Convert array to string
  }

  const updatedPayment = await Payments.findOneAndUpdate(
    {}, // Update all documents that match an empty filter (you may want to specify a filter here)
    paymentData, // Update with the data from req.body
    { new: true, upsert: true } // Return the modified document after update, and create a new one if none exists
  );
  let pricing = await Payments.find({});
  let Message = "Updated Successfully!";

  res.render("adminPricing", { pricing, Message });
});

router.get("/getSkills", sessionChecker, async (req, res) => {
  // Extract data from the request body
  const { customizeData, bidPrice, project_id } = req.body;
  console.log("req body yayayyaay--->", req.body);

  // Retrieve user data
  const id = req.session.user._id; // Update with the correct user ID retrieval mechanism
  let title = req.body.title;
  let username = req.body.user_name;
  const user = await Users.findOne({ _id: id });
  const userId = parseInt(user.id);
  console.log("here is userId-------->", userId);
  const url = "https://www.freelancer.com/api/projects/0.1/jobs/";

  let accessToken = user.access_token;
  console.log("here is access Token-------->", accessToken);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "freelancer-oauth-v1": accessToken,
      },
    });

    if (!response.ok) {
      throw new Error("Network response was not ok " + response.statusText);
    }

    const data = await response.json();

    // Transform the data
    const transformedData = data.result.map((item) => ({
      tag: item.name,
      value: item.id.toString(),
    }));

    // Convert the data to a JSON string
    const jsonString = JSON.stringify(transformedData, null, 2);

    // Define the file path
    const filePath = path.join(__dirname, "exported_data.json");

    // Write the JSON string to a file
    fs.writeFile(filePath, jsonString, (err) => {
      if (err) {
        console.error("Error writing file:", err);
        return res.status(500).send("Error writing file");
      }

      console.log("File successfully written");
      console.log("here is data skills: ", dataSkills);
      res.send("File successfully written");
    });
  } catch (error) {
    console.error("There was a problem with the fetch operation:", error);
    res.status(500).send("There was a problem with the fetch operation");
  }
});

router.get("/userSkills", sessionChecker, async (req, res) => {
  let user = await Users.findOne({ id: req.session.user.id });
  console.log("here is user: ", user);
  // Retrieve the user's access token
  const accessToken = user.access_token;
  console.log("here is access token: ", accessToken);
  let config = {
    method: "get",
    maxBodyLength: Infinity,
    url: "https://freelancer.com/api/users/0.1/self?jobs=true",
    headers: {
      "freelancer-oauth-v1": accessToken,
    },
  };

  axios
    .request(config)
    .then(async (response) => {
      const jobNamesArray = response.data.result.jobs.map((job) => job.name);
      console.log(jobNamesArray);
      // Update user document with skills
      user.skills = jobNamesArray;

      // Save the updated user document
      await user.save();
      console.log("user skills updated: ", user);
      res.redirect("/skills")
    })
    .catch((error) => {
      console.log(error);
    });
});
router.get("/projectReviews", sessionChecker, async (req, res) => {
  try {
    let user = await Users.findOne({ id: req.session.user.id });
    if (!user) {
      return res.status(404).send("User not found");
    }
    console.log("Here is user: ", user);

    // Retrieve the user's access token
    const accessToken = user.access_token;
    console.log("Here is access token: ", accessToken);
    const projectIds = [38217462];
    let config = {
      method: "get",
      maxBodyLength: Infinity,
      url: "https://www.freelancer.com/api/projects/0.1/projects/",
      headers: {
        "freelancer-oauth-v1": accessToken,
      },
      params: {
        projects: projectIds,
      },
    };

    try {
      const response = await axios.request(config);
      const reviews = response.data; // Assuming the response data is what you need
      console.log("Project reviews: ", reviews.result);

      // Use `flatted.stringify` to handle circular references
      const serializedReviews = JSON.stringify(reviews);
      console.log(serializedReviews);
      res.status(200).json(serializedReviews);
    } catch (axiosError) {
      console.error(
        "Error fetching project reviews from Freelancer API: ",
        axiosError
      );
      res
        .status(500)
        .send("Error fetching project reviews from Freelancer API");
    }
  } catch (error) {
    console.error("Error finding user: ", error);
    res.status(500).send("Error finding user");
  }
});
router.get("/userReviews", sessionChecker, async (req, res) => {
  try {
    const user = await Users.findOne({ id: req.session.user.id });
    if (!user) {
      return res.status(404).send("User not found");
    }

    // Retrieve the user's access token
    const accessToken = user.access_token;
    // const userId = [182963,74276474]; // Replace with actual user ID you want to fetch details for
    // const response = await axios.get(`https://www.freelancer.com/api/users/0.1/users/`,
    const userId = 182963; // Replace with actual user ID you want to fetch details for
    const response = await axios.get(
      `https://www.freelancer.com/api/users/0.1/users/${userId}/`,
      {
        headers: {
          "freelancer-oauth-v1": accessToken, // Add OAuth access token to headers
        },
        params: {
          users: userId,
          jobs: true,
          reputation: true,
          employer_reputation: true,
          reputation_extra: true,
          employer_reputation_extra: true,
          user_recommendations: true,
          portfolio_details: true,
          preferred_details: true,
          badge_details: true,
          status: true,
          // Include other parameters as needed
        },
      }
    );

    const userData = response.data; // User data retrieved from the API
    console.log("User data:", userData);
    console.log("User jobs:", userData.result.jobs);
    console.log(
      "User employer_reputation:",
      userData.result.employer_reputation
    );
    console.log("User reputation :", userData.result.reputation);
    const userReviews =
      userData.result?.employer_reputation?.entire_history?.all ?? 0;
    console.log("User revies: ", userReviews);
    res.json(userData); // Send user data as response
  } catch (error) {
    console.error("Error fetching user reviews:", error);
    res.status(500).send("Error fetching user reviews"); // Send error response
  }
});

module.exports = {
  router: router,
  processAutoBids: processAutoBids
};
//latest test 
// router.get("/test", async (req, res) => {
//   try {
//     const usersWithAutoBidOn = await Users.find({ autoBid: true });
//     const usersWithAutoBidOnIds = usersWithAutoBidOn.map((user) => user._id);

//     for (let i = 0; i < usersWithAutoBidOnIds.length; ) {
//       console.log("Current user index:", i);
//       // Get user ID from session
//       const userId = usersWithAutoBidOnIds[i];

//       // Fetch user details using the user ID
//       let user = await Users.findById(userId);
//       console.log("user id: ", user._id);
//       // Extract access token from user details
//       let accessToken = user.access_token;
//       let userSkills = user.skills;
//       const userSkillsWithValue = userSkills
//         .map((skill) => {
//           const matchedSkill = allSkills.find((s) => s.tag === skill);
//           return matchedSkill ? { skill, value: matchedSkill.value } : null;
//         })
//         .filter(Boolean);
//       const userSkillValues = userSkillsWithValue.map((skill) =>
//         Number(skill.value)
//       );
//       // Extract excluded skills and excluded countries from user details
//       let excludedSkills = user.excluded_skills;
//       let excludedCountries = user.excluded_countries;
//       let clientPaymentVerified = user.payment_verified;
//       let clientEmailVerified = user.email_verified;
//       let clientDepositMade = user.deposit_made;
//       let minimumBudgetFix = parseInt(user.minimum_budget_fixed);
//       let minimumBudgetHourly = parseInt(user.minimum_budget_hourly);

//       // Construct headers with access token
//       const headers = { "freelancer-oauth-v1": accessToken };

//       let bidsAllowed = user.bidsAllow;
//       console.log("bits allowed are", bidsAllowed);
//       const currentTime = new Date().toISOString();
//       if(!user.bidEndTime || currentTime < user.bidEndTime){
//         console.log("user bid start time in start : ",user.bidStartTime)
//         if (!user.bidStartTime) {
          
       
//         const currentTime2 = new Date();
//         let updatingStartTime = await Users.findOneAndUpdate(
//           { _id: user._id },
//           { $set: { bidStartTime: currentTime2 } },
//           { new: true }
//         );
//       }

//       if (bidsAllowed > 0) {
//         // API endpoint for fetching projects
//         const url = "https://freelancer.com/api/projects/0.1/projects/all/";

//         // Parameters for the API request
//         const params = {
//           jobs: userSkillValues,
//           min_avg_price: 10,
//           project_statuses: ["active"],
//           full_description: true,
//           job_details: true,
//           user_details: true,
//           location_details: true,
//           user_status: true,
//           user_reputation: true,
//           user_country_details: true,
//           user_display_info: true,
//           user_membership_details: true,
//           user_financial_details: true,
//           compact: true,
//         };

//         // Make request to fetch projects
//         const response = await axios.get(url, {
//           params: params,
//           headers: headers,
//         });

//         // Process response data
//         const responseData = response.data;
//         const projects = responseData.result.projects;

//         // Extract user details for project owners
//         const ownerIds = projects.map((project) => project.owner_id);
//         const projectsDetails = await Promise.all(
//           ownerIds.map(async (ownerId) => {
//             if (!isNaN(ownerId)) {
//               const ownerUrl = `https://freelancer.com/api/users/0.1/users/${ownerId}/`;
//               const ownerResponse = await axios.get(ownerUrl, {
//                 jobs: true,
//                 reputation: true,
//                 employer_reputation: true,
//                 reputation_extra: true,
//                 employer_reputation_extra: true,
//                 job_ranks: true,
//                 staff_details: true,
//                 completed_user_relevant_job_count: true,
//                 headers: headers,
//               });
//               return ownerResponse.data.result;
//             } else {
//               return null;
//             }
//           })
//         );

//         // Render projects
//         const projects2 = responseData.result.projects.map(
//           (project, index) => ({
//             projectid: project.id,
//             type: project.type,
//             description: project.description,
//             title: project.title,
//             currencyName: project.currency.name,
//             currencySign: project.currency.sign,
//             bidCount: project.bid_stats.bid_count,
//             bidAverage: project.bid_stats.bid_avg,
//             jobNames: project.jobs.map((job) => job.name),
//             minimumBudget: project.budget.minimum,
//             maximumBudget: project.budget.maximum,
//             country: project.location.country.flag_url,
//             fullName: projectsDetails[index]?.username,
//             displayName: projectsDetails[index]?.public_name,
//             ownerCountry: projectsDetails[index]?.location?.country?.name,
//             payment: projectsDetails[index]?.status?.payment_verified,
//             email: projectsDetails[index]?.status?.email_verified,
//             deposit_made: projectsDetails[index]?.status?.deposit_made,
//             identity_verified:
//               projectsDetails[index]?.status?.identity_verified,
//             countryShortName: projectsDetails[index]?.timezone?.country,
//           })
//         );

//         const filteredProjects2 = projects2.filter((project) => {
//           // Convert project's countryShortName to lowercase for case-insensitive comparison
//           const projectCountry = project.countryShortName
//             ? project.countryShortName.toLowerCase()
//             : "";

//           // Check if project's countryShortName matches any excluded country (case-insensitive)
//           if (
//             excludedCountries.some(
//               (country) => country.toLowerCase() === projectCountry
//             )
//           ) {
//             return false; // Exclude project
//           }

//           // Check if project's jobNames include any excluded skill (case-insensitive)
//           if (
//             project.jobNames.some((skill) =>
//               excludedSkills.includes(skill.toLowerCase())
//             )
//           ) {
//             return false; // Exclude project
//           }

//           // Check if clientPaymentVerified is 'yes'
//           if (clientPaymentVerified == "yes" && project.payment == null) {
//             return false; // Exclude project
//           }

//           // Check if clientEmailVerified is 'yes'
//           if (clientEmailVerified == "yes" && project.email !== true) {
//             return false; // Include project
//           }

//           // Check if clientDepositMade is 'yes'
//           if (clientDepositMade == "yes" && project.deposit_made == null) {
//             return false; // Exclude project
//           }

//           // Additional filters based on project type (fixed or hourly)
//           if (
//             project.type == "fixed" &&
//             project.minimumBudget <= minimumBudgetFix
//           ) {
//             return false; // Exclude project
//           }

//           if (
//             project.type == "hourly" &&
//             project.minimumBudget <= minimumBudgetHourly
//           ) {
//             return false; // Exclude project
//           }

//           return true; // Include project
//         });
//         const templates = await Templates.find({ userId: userId }).populate(
//           "category"
//         );

//         console.log("here are templates------>", templates);

//         // Function to randomly decide inclusion for templates with always_include = false
//         const randomlyInclude = (probability) => Math.random() < probability;

//         // Filter templates by category, deciding randomly for always_include = false
//         const filteredTemplates = templates.filter((template) => {
//           if (template.category && template.category.always_include === true) {
//             return true; // Always include
//           } else if (
//             template.category &&
//             template.category.always_include === false
//           ) {
//             return randomlyInclude(0.5); // 50% chance to include
//           }
//           return false; // Exclude if category is not defined or always_include is not specified
//         });
//         // Group and sort filteredTemplates by category position
//         const groupedAndSortedTemplates = filteredTemplates.reduce(
//           (acc, template) => {
//             const categoryId = template.category._id.toString();
//             if (!acc[categoryId]) {
//               acc[categoryId] = {
//                 position: template.category.position,
//                 templates: [],
//               };
//             }
//             acc[categoryId].templates.push(template);
//             return acc;
//           },
//           {}
//         );

//         // Convert object to array and sort by position
//         const sortedCategories = Object.values(groupedAndSortedTemplates).sort(
//           (a, b) => a.position - b.position
//         );
//         console.log(sortedCategories);

//         // Function to get final content from templates for a project
//         const getFinalContentForProject = (project, templates, ownerName) => {
//           return templates.reduce((acc, category) => {
//             const randomTemplateIndex = Math.floor(
//               Math.random() * category.templates.length
//             );
//             const selectedTemplate = category.templates[randomTemplateIndex];

//             const replacedContent =
//               selectedTemplate.content
//                 .replace(/{{Project Title}}/g, project.title)
//                 .replace(/{{Owner Name}}/g, ownerName)
//                 .replace(/{{Owner Full Name}}/g, project.displayName)
//                 .replace(
//                   /{{Matching Job Skills}}/g,
//                   project.jobNames.join(", ")
//                 )
//                 .replace(
//                   /{{Owner First Name}}/g,
//                   ownerName.split(" ")[0] || ownerName
//                 )
//                 .replace(/{{Country}}/g, project.ownerCountry) + "\n";

//             return acc + replacedContent;
//           }, "");
//         };

//         const filteredProjectDetails = filteredProjects2.map((project) => {
//           const ownerName = project.fullName || project.displayName || "";
//           const finalContent = getFinalContentForProject(
//             project,
//             sortedCategories,
//             ownerName
//           );
//           //making caption
          
//           return {
//             projectid: project.projectid,
//             title: project.title,
//             bidAverage: project.bidAverage,
//             minimumBudget: project.minimumBudget,
//             maximumBudget: project.maximumBudget,
//             fullName: project.fullName,
//             displayName: project.displayName,
//             jobNames: project.jobNames,
//             description: finalContent,
//           };
//         });
//         console.log(
//           "Final project details with descriptions:",
//           filteredProjectDetails
//         );
//         const numBids = Math.min(bidsAllowed, user.bidsLimit);

//         const currentTime = new Date();
//         const timeLimitInMinutes = user.timeLimit;

//         // Add the time limit in minutes to the current time
//         const newTime = new Date(
//           currentTime.getTime() + timeLimitInMinutes * 60000
//         );

//         let whenToStop = new Date(user.bidEndTime).getTime();
//         let latestTime = Date.now();

//           if (isIntervalHit(user.bidStartTime, user.timeInterval)) {
//             const project = filteredProjectDetails[0];
//             console.log("here is project", project);

//             // Extract project details
//             const {
//               projectid,
//               minimumBudget,
//               maximumBudget,
//               description,
//               bidAverage,
//               title,
//               fullName,
//             } = project;
//             let averageBid = parseInt(bidAverage);
//             let lowRange = parseInt(user.lower_bid_range);
//             let highRange = parseInt(user.higher_bid_range);
//             const lowerValue = averageBid * (lowRange / 100);
//             const higherValue = averageBid * (highRange / 100);
//             console.log("Average Bid:", averageBid);
//             console.log("Low Range:", lowRange);
//             console.log("High Range:", highRange);
//             console.log("here is user value------>", higherValue);
//             console.log("here is user value------>", lowerValue);
//             let smallValue = averageBid - lowerValue;
//             let largeValue = averageBid + higherValue;
//             let randomValue = parseFloat(
//               (smallValue + Math.random() * (largeValue - smallValue)).toFixed(
//                 2
//               )
//             );
//             console.log("Random Value:---->", randomValue);
//             console.log("here is high value------>", smallValue);
//             console.log("here is randomValue------>", randomValue);
//             // Calculate the bid amount (between minimumBudget and maximumBudget)

//             let bidderid = parseInt(user.id);
//             let projectID = parseInt(projectid);
//             let bidMoney = parseFloat(randomValue);
//             if (isNaN(bidMoney) || lowRange == 0 || highRange == 0) {
//               bidMoney = parseFloat(averageBid);
//             }
//             // console.log("Amount:", amount);
//             console.log("Bidder ID:", bidderid);
//             console.log("Project ID:", projectID);
//             console.log("Bid Money:", bidMoney);
//             // Prepare the bid request body
//             const bidRequestBody = {
//               project_id: projectID,
//               bidder_id: bidderid,
//               amount: bidMoney,
//               period: 3,
//               milestone_percentage: 50,
//               description: description,
//             };

//             try {
//               // Make the POST request to Freelancer API
//               const response = await fetch(
//                 `https://www.freelancer.com/api/projects/0.1/bids/`,
//                 {
//                   method: "POST",
//                   headers: {
//                     "Content-Type": "application/json",
//                     "freelancer-oauth-v1": accessToken,
//                   },
//                   body: JSON.stringify(bidRequestBody),
//                 }
//               );

//               // Parse the JSON response
//               const responseData = await response.json();

//               // Log response
//               console.log("Bid Response: ", responseData);
//               console.log("User Id :", user._id);
//               if (responseData.status == "error") {
              
//                 const date = new Date().toISOString().split("T")[0];
//                 const newRecord = await Projects.create({
//                   // Define the fields of the new record
//                   bidDescription: responseData.message,
//                   projectTitle: project.title,
//                   bidAmount: bidMoney,
//                   userName: project.fullName,
//                   status:1,
//                   time: date,
//                   user: user._id,
//                   // Add more fields as needed
//                 });
//                 // Decrease bidsAllowed by 1 for the user if bid was successful
              
//               }

//               if (responseData.status !== "error") {
//                 let dateString = responseData.result.submitdate;
//                 const date = new Date().toISOString().split("T")[0];
//                 const newRecord = await Projects.create({
//                   // Define the fields of the new record
//                   bidDescription: description,
//                   projectTitle: title,
//                   bidAmount: responseData.result.amount,
//                   userName: fullName,
//                   time: date,
//                   user: user._id,
//                   // Add more fields as needed
//                 });
//                 // Decrease bidsAllowed by 1 for the user if bid was successful
//                 bidsAllowed = bidsAllowed - 1;

//                 await Users.updateOne(
//                   { _id: user._id },
//                   { $inc: { bidsAllow: -1 } } // Decrement by 1
//                 );
//                 let bidlimit = user.bidsLimit;
//                 if (user.bidsLimit <= 0) {
//                   let updatingAutoBid = await Users.findOneAndUpdate(
//                     { _id: user._id },
//                     { $set: { autoBid: false } }, // Update operation to set the `bidStartTime` field
//                     { new: true } // Option to return the updated document
//                   );
//                 }

                

//                 let updatingStartTime = await Users.findOneAndUpdate(
//                   { _id: user._id },
//                   { $set: { bidStartTime: currentTime, bidEndTime: newTime } },
//                   { new: true }
//                 );
//               }

              
//             } catch (error) {
//               console.error("Error occurred while sending bid:", error);
//               // Handle error if needed
//             }
//           } else {
//             console.log("is interval hit return false");
//           }
        

//         console.log("updating time", user._id);
        
//       }
      
//     console.log("time checking of bid start and end ",user.bidStartTime,"bid end time:")
//     }else{
//       console.log("setting auto bid off and end and start date empty for user ")
//       let updatingAutoBid = await Users.findOneAndUpdate(
//         { _id: user._id },
//         { 
//           $set: { 
//             autoBid: false, 
//             bidEndTime: "", 
//             bidStartTime: "" 
//           } 
//         },
//         { new: true } // Option to return the updated document
//       );
//     }
//       console.log("Moving to the next user...");
//       i++;
//     }
//     console.log("all users done");
//     res.status(200).send("Processing complete for all users with autoBid on");
//   } catch (error) {
//     console.error("Error occurred:", error);
//     return res.status(500).json({ error: "Internal Server Error" });
//   }
// });