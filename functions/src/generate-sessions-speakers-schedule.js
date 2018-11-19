import * as functions from 'firebase-functions';
import { firestore } from 'firebase-admin';
import mapSessionsSpeakersSchedule from './schedule-generator/speakers-sessions-schedule-map';
import mapSessionsSpeakers from './schedule-generator/speakers-sessions-map';

export const sessionsWrite = functions.firestore.document('sessions/{sessionId}').onWrite( async () => {
    return generateAndSaveData();
});

export const scheduleWrite = functions.firestore.document('schedule/{scheduleId}').onWrite( async () => {
    const scheduleConfig = functions.config().schedule;
    const scheduleEnabled = scheduleConfig && scheduleConfig.enabled === 'true';
    return scheduleEnabled && generateAndSaveData();
});

export const speakersWrite = functions.firestore.document('speakers/{speakerId}').onWrite( async (change, context) => {
    const changedSpeaker = change.after.exists ? { id: context.params.speakerId, ...change.after.data() } : null;
    return generateAndSaveData(changedSpeaker);
});

async function generateAndSaveData(changedSpeaker) {
    const sessionsPromise = firestore().collection('sessions').get();
    const schedulePromise = firestore().collection('schedule').get();
    const speakersPromise = firestore().collection('speakers').get();

    const [sessionsSnapshot, scheduleSnapshot, speakersSnapshot] = await Promise.all([sessionsPromise, schedulePromise, speakersPromise]);

    console.log("schedule snapshot:"+ JSON.stringify(scheduleSnapshot, null, 2));
    console.log("speakers snapshot:"+ JSON.stringify(speakersSnapshot, null, 2));



    const sessions = {};
    const schedule = {};
    const speakers = {};

    sessionsSnapshot.forEach((doc) => {
        sessions[doc.id] = doc.data();
    });

    scheduleSnapshot.forEach((doc) => {
        schedule[doc.id] = doc.data();
        console.log("schedule snapshot doc.id:"+ doc.id);

    });

    speakersSnapshot.forEach((doc) => {
        speakers[doc.id] = doc.data();
    });

    let generatedData = {}
    const scheduleConfig = functions.config().schedule;
    console.log("schedule config:"+ scheduleConfig.enabled);

    const scheduleEnabled = scheduleConfig && scheduleConfig.enabled === 'true';
    console.log("schedule enabled:"+ scheduleEnabled);


    if (!Object.keys(sessions).length) {
        generatedData = { ...speakers };
        console.log("speakers");

    }
    else if (!scheduleEnabled || !Object.keys(schedule).length) {
        generatedData = mapSessionsSpeakers(sessions, speakers);
        console.log("sessions and speakers");

    }
    else {
        generatedData = mapSessionsSpeakersSchedule(sessions, speakers, schedule);
        console.log("sessions and speakers and schedule");

    }

    // If changed speaker does not have assigned session(s) yet
    if (changedSpeaker && !generatedData.speakers[changedSpeaker.id]) {
        console.log("changed speaker id:"+ JSON.stringify(changedSpeaker.id, null, 2));
        generatedData.speakers[changedSpeaker.id] = changedSpeaker;
    }

    saveGeneratedData(generatedData.sessions, 'generatedSessions');
    saveGeneratedData(generatedData.speakers, 'generatedSpeakers');
    saveGeneratedData(generatedData.schedule, 'generatedSchedule');
    console.log(generatedData.schedule);

}

function saveGeneratedData(data, collectionName) {
    if (!data || !Object.keys(data).length) return;

    console.log("data:"+ JSON.stringify(data, null, 2));
    console.log("collectionName:"+ collectionName);



    for (let index = 0; index < Object.keys(data).length; index++) {
        const key = Object.keys(data)[index];
        firestore().collection(collectionName)
            .doc(key)
            .set(data[key]);
    }
}