from django.core.urlresolvers import reverse
from rest_framework.test import APIClient
from django.contrib.auth.models import User
import random
import json
from time import time


def test_create_bug_job_map_no_auth(eleven_jobs_processed, jm):
    """
    test creating a single note via endpoint
    """
    client = APIClient()

    job = jm.get_job_list(0, 1)[0]

    bug_job_map_obj = {
        "job_id": job["id"],
        "bug_id": 1,
        "type": "manual"
    }

    resp = client.post(
        reverse("bug-job-map-list", kwargs={"project": jm.project}),
        bug_job_map_obj, expect_errors=True)

    assert resp.status_code == 403

    jm.disconnect()


def test_create_bug_job_map(eleven_jobs_processed, mock_message_broker, jm):
    """
    test creating a single note via endpoint
    """

    client = APIClient()
    user = User.objects.create(username="MyName", is_staff=True)
    client.force_authenticate(user=user)

    job = jm.get_job_list(0, 1)[0]

    bug_job_map_obj = {
        "job_id": job["id"],
        "bug_id": 1,
        "type": "manual"
    }

    resp = client.post(
        reverse("bug-job-map-list", kwargs={"project": jm.project}),
        bug_job_map_obj
    )



    bug_job_map_obj["who"] = "MyName"

    user.delete()

    actual_obj = jm.get_bug_job_map_list(0, 1)[0]
    del actual_obj["submit_timestamp"]

    assert bug_job_map_obj == actual_obj

    jm.disconnect()


def test_create_bug_job_map_dupe(eleven_jobs_processed, mock_message_broker, jm):
    """
    test creating the same bug map skips it
    """

    client = APIClient()
    user = User.objects.create(username="MyName", is_staff=True)
    client.force_authenticate(user=user)

    job = jm.get_job_list(0, 1)[0]

    bug_job_map_obj = {
        "job_id": job["id"],
        "bug_id": 1,
        "type": "manual",
    }

    client.post(
        reverse("bug-job-map-list", kwargs={"project": jm.project}),
        bug_job_map_obj
    )

    client.post(
        reverse("bug-job-map-list", kwargs={"project": jm.project}),
        bug_job_map_obj
    )

    bug_job_map_obj["who"] = "MyName"

    user.delete()

    actual_obj = jm.get_bug_job_map_list(0, 1)[0]
    del actual_obj["submit_timestamp"]

    assert bug_job_map_obj == actual_obj

    jm.disconnect()

def test_bug_job_map_list(webapp, jm, eleven_jobs_processed):
    """
    test retrieving a list of bug_job_map
    """
    jobs = jm.get_job_list(0, 10)
    bugs = [random.randint(0, 100) for i in range(0, len(jobs))]
    submit_timestamp = int(time())
    who = "user@mozilla.com"

    expected = list()

    for i, v in enumerate(jobs):

        jm.insert_bug_job_map(v["id"], bugs[i],
                              "manual", submit_timestamp, who)
        expected.append({
            "job_id": v["id"],
            "bug_id": bugs[i],
            "type": "manual",
            "submit_timestamp": submit_timestamp,
            "who": who
        })
        submit_timestamp += 1

    resp = webapp.get(
        reverse("bug-job-map-list", kwargs={"project": jm.project}))

    for i, v in enumerate(expected):
        assert v == resp.json[i]

    jm.disconnect()

def test_bug_job_map_detail(webapp, jm, eleven_jobs_processed):
    """
    test retrieving a list of bug_job_map
    """
    job_id = jm.get_job_list(0, 1)[0]["id"]
    bug_id = random.randint(0, 100)

    expected = list()

    submit_timestamp = int(time())
    who = "user@mozilla.com"
    jm.insert_bug_job_map(job_id, bug_id, "manual", submit_timestamp, who)

    pk = "{0}-{1}".format(job_id, bug_id)

    resp = webapp.get(
        reverse("bug-job-map-detail", kwargs={
            "project": jm.project,
            "pk": pk
        })
    )

    expected = {
        "job_id": job_id,
        "bug_id": bug_id,
        "type": "manual",
        "submit_timestamp": submit_timestamp,
        "who": who}

    assert resp.json == expected

    jm.disconnect()


def test_bug_job_map_delete(webapp, eleven_jobs_processed,
                            jm, mock_message_broker):
    """
    test retrieving a list of bug_job_map
    """
    client = APIClient()
    user = User.objects.create(username="MyName", is_staff=True)
    client.force_authenticate(user=user)

    job_id = jm.get_job_list(0, 1)[0]["id"]
    bug_id = random.randint(0, 100)

    submit_timestamp = int(time())
    who = "user@mozilla.com"

    jm.insert_bug_job_map(job_id, bug_id,
                          "manual", submit_timestamp, who)

    pk = "{0}-{1}".format(job_id, bug_id)

    resp = client.delete(
        reverse("bug-job-map-detail", kwargs={
            "project": jm.project,
            "pk": pk
        })
    )

    user.delete()

    content = json.loads(resp.content)
    assert content == {"message": "Bug job map deleted"}

    jm.disconnect()


def test_bug_job_map_delete_no_auth(jm, eleven_jobs_processed):
    """
    test retrieving a list of bug_job_map
    """
    client = APIClient()

    job_id = jm.get_job_list(0, 1)[0]["id"]
    bug_id = random.randint(0, 100)

    submit_timestamp = int(time())
    who = "user@mozilla.com"

    jm.insert_bug_job_map(job_id, bug_id, "manual",
                          submit_timestamp, who)

    pk = "{0}-{1}".format(job_id, bug_id)



    resp = client.delete(
        reverse("bug-job-map-detail", kwargs={
            "project": jm.project,
            "pk": pk
        })
    )

    assert resp.status_code == 403

    jm.disconnect()
