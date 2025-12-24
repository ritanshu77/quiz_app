// index.js - Complete MCQ Quiz API
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Frontend files serve karne ke liye

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/mcq_quiz', {
    // useNewUrlParser: true,
    // useUnifiedTopology: true
}).then(() => {
    console.log('✅ MongoDB Connected - mcq_quiz database');
}).catch(err => {
    console.error('❌ MongoDB Connection Error:', err);
});

// Question Schema
const questionSchema = new mongoose.Schema({
    question_text: { type: String, required: true },
    subject: { type: String, required: true },
    topic: { type: String, required: true },
    difficulty: { type: String, default: '' },
    options: [{
        text: { type: String, required: true },
        is_correct: { type: Boolean, default: false }
    }],
    explanation: String,
    comments: [{
        user_id: { type: String, default: 'guest' },
        text: String,
        created_at: { type: Date, default: Date.now },
        updated_at: { type: Date, default: Date.now }
    }],
    created_at: { type: Date, default: Date.now }
});

const Question = mongoose.model('Question', questionSchema);

// User Schema (Score tracking)
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    total_score: { type: Number, default: 0 },
    total_attempts: { type: Number, default: 0 },
    weak_topics: [String]
});

const User = mongoose.model('User', userSchema);

// Sample Rajasthan Computer Instructor Questions (Auto-insert if empty)
async function seedData() {
    const count = await Question.countDocuments();
    if (count === 0) {
        console.log('🌱 Seeding sample questions...');
        await Question.insertMany([
            {
                question_text: "jQuery kis language ki library hai?",
                subject: "Web Development",
                topic: "jQuery",
                options: [
                    { text: "JavaScript", is_correct: true },
                    { text: "Python", is_correct: false },
                    { text: "PHP", is_correct: false },
                    { text: "C++", is_correct: false }
                ],
                explanation: "jQuery JavaScript ki lightweight library hai"
            },
            {
                question_text: "Rajasthan ka capital kya hai?",
                subject: "Rajasthan GK",
                topic: "Geography",
                options: [
                    { text: "Delhi", is_correct: false },
                    { text: "Jaipur", is_correct: true },
                    { text: "Jodhpur", is_correct: false },
                    { text: "Udaipur", is_correct: false }
                ]
            },
            {
                question_text: "C++ me class ka keyword kya hai?",
                subject: "Programming",
                topic: "C++",
                options: [
                    { text: "struct", is_correct: false },
                    { text: "class", is_correct: true },
                    { text: "object", is_correct: false },
                    { text: "function", is_correct: false }
                ]
            }
        ]);
        console.log('✅ 3 Sample questions added!');
    }
}

// API Routes
// 🔥 Comment add/update API
app.put('/api/questions/:id/comment', async (req, res) => {
  try {
    const { id } = req.params;                 // URL se questionId
    const { comment, user_id = 'guest' } = req.body;  // body se comment text
    console.log("----id--------",id)
    if (!comment || !comment.trim()) {
      return res.status(400).json({ error: 'Comment required' });
    }

    const question = await Question.findById(id);
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    // Agar same user ka comment pehle se hai to update, warna push
    if (!question.comments) question.comments = [];
    const existing = question.comments.find(c => c.user_id === user_id);
    console.log("-----existing-----",existing)
    if (existing) {
      existing.text = comment;
      existing.updated_at = new Date();
    } else {
      question.comments.push({
        user_id,
        text: comment,
        created_at: new Date(),
        updated_at: new Date()
      });
    }

    await question.save().then(()=>{
        console.log("----q save--")
    }).catch(error=>console.log("---error---",error));
    res.json({ success: true, message: 'Comment saved successfully!' });

  } catch (err) {
    console.error('Comment API error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 1. GET Random Questions by Subject
app.get('/api/questions', async (req, res) => {
    try {
        console.log("--req.query========", req.query)
        const { subject, topic, limit = 20, difficulty } = req.query;
        const filter = {};

        if (subject) filter.subject = subject;
        if (topic) filter.topic = topic;
        if (difficulty) filter.difficulty = difficulty;
        console.log("-----agg---", [
            { $match: filter },
            { $sample: { size: parseInt(limit) } }
        ])
        const questions = await Question.aggregate([
            { $match: filter },
            { $limit: parseInt(limit) },
            { $sample: { size: parseInt(limit) } }
        ]);
        console.log("------questionsL---------", questions.length)
        res.json(questions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. POST Submit Answer & Get Feedback
app.post('/api/answers', async (req, res) => {
    try {
        const { question_id, selected_option_index, user_id = 1 } = req.body;

        const question = await Question.findById(question_id);
        if (!question) return res.status(404).json({ error: 'Question not found' });

        const selectedOption = question.options[selected_option_index];
        const is_correct = selectedOption.is_correct;
        const explanation = question.explanation || 'No explanation available';

        // Update user score (simple logic)
        if (user_id) {
            await User.findOneAndUpdate(
                { _id: user_id },
                { $inc: { total_score: is_correct ? 1 : 0, total_attempts: 1 } },
                { upsert: true }
            );
        }

        res.json({
            is_correct,
            explanation,
            correct_answer: question.options.find(opt => opt.is_correct).text
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. GET User Stats
app.get('/api/user/:id/stats', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        res.json(user || { total_score: 0, total_attempts: 0 });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. Serve Frontend
// ✅ NEW - Direct HTML serve karo
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>MCQ Quiz</title>
            <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
            <!-- Minimal HTML + CSS -->
        </head>
        <body>
            <h1>MCQ Quiz Loading...</h1>
            <div id="quiz"></div>
            <script>
                $.get('/api/questions?limit=10', function(data) {
                    console.log('Questions loaded:', data.length);
                    $('#quiz').html('✅ Database connected! ' + data.length + ' questions ready');
                });
            </script>
        </body>
        </html>
    `);
});

// 5 
app.post('/api/questions', async (req, res) => {
    try {
        const questionsData = req.body;

        let result;
        if (Array.isArray(questionsData)) {
            result = await Question.insertMany(questionsData);
            console.log(`✅ ${result.length} questions added!`);
        } else {
            result = await Question.create(questionsData);
            console.log(`✅ 1 question added: ${questionsData.question_text}`);
        }

        res.json({
            success: true,
            inserted: Array.isArray(result) ? result.length : 1,
            questions: result
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// Seed data on startup
// seedData();

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 MCQ Quiz Server running on http://localhost:${PORT}`);
    console.log(`📱 Frontend: http://localhost:${PORT}`);
    console.log(`📊 API Docs: http://localhost:${PORT}/api/questions?subject=Web%20Development`);
});
