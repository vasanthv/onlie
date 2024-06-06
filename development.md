## How to run locally

### Prerequisite

- Node.js
- MongoDb

Fork this repo and then clone it:

```
git clone https://github.com/<your_name>/onlie.git
```

You need MongoDB to run this application. If you don't already have MongoDB, go to the [official documentation](https://docs.mongodb.com/manual/installation/) and follow the instructions there. Once you have MongoDB installed, run

```
mongo
```

to start the MongoDB instance. Then cd into directory where the repo was cloned and install the dependencies:

```
npm install
```

Then run

```
npm start
```

to start the development server on port 755. Your Onlie instance will be running on http://localhost:755.
