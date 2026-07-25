import {setGlobalOptions} from "firebase-functions/v2";
setGlobalOptions({region: 'europe-west1'});

import * as admin from 'firebase-admin';
admin.initializeApp();

import {setupAccountHandle} from './setupAccountHandle';
import {seedDatabaseHandle} from './seedDatabaseHandle';
import {collectCardHandle} from './collectCardHandle';
import {answerQuestionHandle} from './answerQuestionHandle';
import {joinGuildHandle} from './joinGuildHandle';
import {collectPinHandle} from './collectPinHandle';
import {getPinsHandle} from './getPinsHandle';
import {upsertPinHandle} from './upsertPinHandle';
import {deletePinHandle} from './deletePinHandle';
import {submitPhotoHandle} from './submitPhotoHandle';
import {reviewPhotoHandle} from './reviewPhotoHandle';
import {getPhotoSubmissionsHandle} from './getPhotoSubmissionsHandle';
import {recheckAchievementsHandle} from './recheckAchievementsHandle';
import {onSchedule} from "firebase-functions/scheduler";
import {logger} from "firebase-functions";
import updateRoundsProcessor from "./updateRoundsProcessor";
import {HttpsError, onCall} from "firebase-functions/https";
import {getFirestore} from "firebase-admin/firestore";
import assertAdmin from "./actions/assertAdmin";

export {
    setupAccountHandle, seedDatabaseHandle, collectCardHandle, answerQuestionHandle, joinGuildHandle,
    collectPinHandle, getPinsHandle, upsertPinHandle, deletePinHandle,
    submitPhotoHandle, reviewPhotoHandle, getPhotoSubmissionsHandle, recheckAchievementsHandle
};

export const updateRoundsHandle = onCall(async (req): Promise<{}> => {
    const auth = req.auth;

    if (!auth || !auth.uid) {
        logger.error('updateRoundsHandle', 'permission denied');
        throw new HttpsError('permission-denied', 'permission denied');
    }

    await assertAdmin(getFirestore(), auth.uid);

    const result = await updateRoundsProcessor();
    return { result };
});

export const autoUpdateRounds = onSchedule("0 * * * *", async () => {
    logger.info("Automatic update rounds");
    await updateRoundsProcessor();
});